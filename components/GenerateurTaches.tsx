"use client";

import React, { useEffect, useMemo, useState } from "react";

type FrequencyType = "jour" | "semaine" | "mois";

type NotionPropType =
  | "title"
  | "rich_text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone_number";

type NotionProperty = {
  id?: string;
  name: string;
  type: NotionPropType | string;
  // options possibles (select/status/multi_select)
  options?: { id: string; name: string; color?: string }[];
};

type SchemaResponse = {
  databaseId: string;
  properties: Record<string, NotionProperty>; // key = property key in Notion API
};

type GeneratedTask = {
  title: string;
  dateISO: string; // YYYY-MM-DD
};

function frDayLabelFromNotionDayIndex(d: string) {
  // Notion/JS getDay(): 0=Dim,1=Lun,...6=Sam
  const map = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
  const idx = Number(d);
  return map[Number.isFinite(idx) ? idx : 0] ?? "Di";
}

function toISODate(d: Date) {
  // YYYY-MM-DD (sans timezone problems côté input date)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function GenerateurTaches() {
  // -----------------------
  // UI / Recurrence
  // -----------------------
  const [taskName, setTaskName] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD
  const [frequency, setFrequency] = useState("1");
  const [frequencyType, setFrequencyType] = useState<FrequencyType>("jour");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [monthDay, setMonthDay] = useState("1");

  const [message, setMessage] = useState("");

  // -----------------------
  // Notion creds
  // -----------------------
  const [databaseId, setDatabaseId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  // -----------------------
  // Schema auto (Notion DB properties)
  // -----------------------
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string>("");

  // mapping minimal: quel champ = Title ? quel champ = Date ?
  const [titlePropKey, setTitlePropKey] = useState<string>("");
  const [datePropKey, setDatePropKey] = useState<string>("");

  // defaults pour les autres champs (remplis une seule fois, appliqué à toutes les tâches)
  const [defaults, setDefaults] = useState<Record<string, any>>({});

  // Preview tasks
  const tasks: GeneratedTask[] = useMemo(() => {
    if (!taskName || !startDate || !endDate) return [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return [];
    }

    const freqN = Math.max(1, parseInt(frequency || "1", 10) || 1);
    const res: GeneratedTask[] = [];
    let current = new Date(start);

    while (current <= end) {
      if (frequencyType === "jour") {
        res.push({
          title: `${taskName} — ${current.toLocaleDateString("fr-FR")}`,
          dateISO: toISODate(current),
        });
        current.setDate(current.getDate() + freqN);
      }

      if (frequencyType === "semaine") {
        if (selectedDays.includes(current.getDay().toString())) {
          res.push({
            title: `${taskName} — ${current.toLocaleDateString("fr-FR")}`,
            dateISO: toISODate(current),
          });
        }
        current.setDate(current.getDate() + 1);
      }

      if (frequencyType === "mois") {
        const md = Math.min(31, Math.max(1, parseInt(monthDay || "1", 10) || 1));
        if (current.getDate() === md) {
          res.push({
            title: `${taskName} — ${current.toLocaleDateString("fr-FR")}`,
            dateISO: toISODate(current),
          });
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return res;
  }, [taskName, startDate, endDate, frequency, frequencyType, selectedDays, monthDay]);

  function toggleDay(day: string) {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  // message résumé
  useEffect(() => {
    if (!taskName || !startDate || !endDate) {
      setMessage("");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      setMessage("⚠️ Dates invalides");
      return;
    }

    if (tasks.length === 0) {
      setMessage("");
      return;
    }

    let freqText = "";
    if (frequencyType === "jour") {
      freqText = `tous les ${Math.max(1, parseInt(frequency || "1", 10) || 1)} jour(s)`;
    } else if (frequencyType === "semaine") {
      const jours = selectedDays.map(frDayLabelFromNotionDayIndex).join(", ");
      freqText = `chaque ${jours || "—"}`;
    } else {
      freqText = `le ${monthDay || "1"} de chaque mois`;
    }

    setMessage(
      `📌 ${tasks.length} tâches **${taskName}**\n${freqText}\nDu ${start.toLocaleDateString(
        "fr-FR"
      )} au ${end.toLocaleDateString("fr-FR")}`
    );
  }, [tasks, taskName, startDate, endDate, frequencyType, frequency, selectedDays, monthDay]);

  // -----------------------
  // Récupérer schema Notion
  // -----------------------
  async function fetchSchema() {
    if (!databaseId || !apiKey) {
      setSchemaError("⚠️ Renseigne Database ID + API Key avant de récupérer les champs.");
      return;
    }

    setSchemaError("");
    setSchemaLoading(true);
    setSchema(null);

    try {
      const res = await fetch("/api/notion/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseId, apiKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSchemaError(`❌ Impossible de récupérer les champs : ${data?.message || "Erreur API"}`);
        setSchemaLoading(false);
        return;
      }

      const s: SchemaResponse = data;
      setSchema(s);

      // auto-select title/date si possible
      const keys = Object.keys(s.properties || {});
      const firstTitle = keys.find((k) => s.properties[k]?.type === "title") || "";
      const firstDate = keys.find((k) => s.properties[k]?.type === "date") || "";

      setTitlePropKey((prev) => prev || firstTitle);
      setDatePropKey((prev) => prev || firstDate);

      // reset defaults quand on change de base
      setDefaults({});
    } catch (e) {
      setSchemaError("❌ Erreur réseau/serveur pendant la récupération des champs.");
    } finally {
      setSchemaLoading(false);
    }
  }

  const schemaKeys = useMemo(() => Object.keys(schema?.properties || {}), [schema]);
  const titleKeys = useMemo(
    () => schemaKeys.filter((k) => (schema?.properties?.[k]?.type || "") === "title"),
    [schemaKeys, schema]
  );
  const dateKeys = useMemo(
    () => schemaKeys.filter((k) => (schema?.properties?.[k]?.type || "") === "date"),
    [schemaKeys, schema]
  );

  // Champs “extra” affichables (hors title/date)
  const extraKeys = useMemo(() => {
    if (!schema) return [];
    return schemaKeys.filter((k) => k !== titlePropKey && k !== datePropKey);
  }, [schema, schemaKeys, titlePropKey, datePropKey]);

  function setDefaultFor(key: string, value: any) {
    setDefaults((prev) => ({ ...prev, [key]: value }));
  }

  // -----------------------
  // Envoi à Notion
  // -----------------------
  async function sendToNotion() {
    if (!databaseId || !apiKey) {
      setMessage("⚠️ Fournis Database ID et API Key.");
      return;
    }
    if (!schema) {
      setMessage("⚠️ D’abord clique sur “Récupérer les champs” pour charger la structure de ta base.");
      return;
    }
    if (!titlePropKey) {
      setMessage("⚠️ Sélectionne le champ Notion de type “Title” (le titre).");
      return;
    }
    if (tasks.length === 0) {
      setMessage("⚠️ Ajoute au moins une tâche (nom + dates).");
      return;
    }

    try {
      const res = await fetch("/api/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId,
          apiKey,
          schema: {
            titlePropKey,
            datePropKey: datePropKey || null,
          },
          defaults,
          tasks,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(`❌ Échec envoi Notion : ${data?.message || "Erreur API"}`);
        console.error("Erreur Notion:", data?.details || data);
        return;
      }

      setMessage("✅ Tâches envoyées dans Notion !");
    } catch (err) {
      console.error(err);
      setMessage("❌ Erreur réseau ou serveur");
    }
  }

  // -----------------------
  // Render helpers for dynamic inputs
  // -----------------------
  function renderExtraField(propKey: string) {
    if (!schema) return null;
    const p = schema.properties[propKey];
    if (!p) return null;

    const type = p.type;

    // On limite volontairement aux types simples “faciles à remplir”
    if (type === "checkbox") {
      const v = Boolean(defaults[propKey] ?? false);
      return (
        <label key={propKey} className="flex items-center justify-between gap-3 text-xs text-zinc-700">
          <span className="font-medium">{p.name}</span>
          <input
            type="checkbox"
            checked={v}
            onChange={(e) => setDefaultFor(propKey, e.target.checked)}
            className="h-4 w-4"
          />
        </label>
      );
    }

    if (type === "number") {
      const v = defaults[propKey] ?? "";
      return (
        <label key={propKey} className="block text-xs text-zinc-600 font-medium">
          {p.name}
          <input
            type="number"
            value={v}
            onChange={(e) => setDefaultFor(propKey, e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
            placeholder="ex: 1"
          />
        </label>
      );
    }

    if (type === "rich_text") {
      const v = defaults[propKey] ?? "";
      return (
        <label key={propKey} className="block text-xs text-zinc-600 font-medium">
          {p.name}
          <textarea
            value={v}
            onChange={(e) => setDefaultFor(propKey, e.target.value)}
            className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
            placeholder="Texte…"
            rows={2}
          />
        </label>
      );
    }

    if (type === "url" || type === "email" || type === "phone_number") {
      const v = defaults[propKey] ?? "";
      return (
        <label key={propKey} className="block text-xs text-zinc-600 font-medium">
          {p.name}
          <input
            type="text"
            value={v}
            onChange={(e) => setDefaultFor(propKey, e.target.value)}
            className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
            placeholder={type === "url" ? "https://..." : type === "email" ? "email@..." : "+33..."}
          />
        </label>
      );
    }

    if (type === "select" || type === "status") {
      const opts = p.options || [];
      const v = defaults[propKey] ?? "";
      return (
        <label key={propKey} className="block text-xs text-zinc-600 font-medium">
          {p.name}
          <select
            value={v}
            onChange={(e) => setDefaultFor(propKey, e.target.value)}
            className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
          >
            <option value="">—</option>
            {opts.map((o) => (
              <option key={o.id} value={o.name}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (type === "multi_select") {
      const opts = p.options || [];
      const v: string[] = Array.isArray(defaults[propKey]) ? defaults[propKey] : [];
      return (
        <div key={propKey} className="space-y-1">
          <p className="text-xs text-zinc-600 font-medium">{p.name}</p>
          <div className="flex flex-wrap gap-1">
            {opts.map((o) => {
              const active = v.includes(o.name);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    const next = active ? v.filter((x) => x !== o.name) : [...v, o.name];
                    setDefaultFor(propKey, next);
                  }}
                  className={`px-2 py-1 rounded-full text-xs border ${
                    active ? "bg-[#9600ff] text-white border-[#9600ff]" : "bg-white text-zinc-700 border-zinc-200"
                  }`}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // Types non gérés (people, relation, formula, rollup, files, etc.)
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/90 rounded-2xl shadow-lg ring-1 ring-zinc-200 p-5 space-y-4">
        {/* Titre */}
        <h1 className="text-lg font-bold text-zinc-800 text-center">📝 Le Programmeur de Récurrence</h1>
        <div className="h-1 w-20 bg-gradient-to-r from-[#9600ff] to-[#ed0ecf] mx-auto rounded-full"></div>

        {/* Nom tâche */}
        <label className="block text-xs text-zinc-600 font-medium">
          Nom de la tâche
          <input
            type="text"
            placeholder="ex: Arroser les plantes"
            className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800 placeholder-zinc-500 shadow-sm"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
          />
        </label>

        {/* Fréquence */}
        <label className="block text-xs text-zinc-600 font-medium">
          Fréquence
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm">Tous les</span>
            <input
              type="number"
              min="1"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-14 rounded border border-zinc-200 p-2 text-sm text-zinc-800"
              placeholder="1"
            />
            <select
              value={frequencyType}
              onChange={(e) => setFrequencyType(e.target.value as FrequencyType)}
              className="rounded border border-zinc-200 p-2 text-sm text-zinc-800"
            >
              <option value="jour">Jour</option>
              <option value="semaine">Semaine</option>
              <option value="mois">Mois</option>
            </select>
          </div>
        </label>

        {/* Si semaine : choix des jours */}
        {frequencyType === "semaine" && (
          <div className="flex gap-1 mt-1">
            {["1", "2", "3", "4", "5", "6", "0"].map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`flex-1 rounded-lg py-1 text-xs border ${
                  selectedDays.includes(d) ? "bg-[#9600ff] text-white" : "bg-white text-zinc-600"
                }`}
              >
                {["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"][i]}
              </button>
            ))}
          </div>
        )}

        {/* Si mois : choix du jour du mois */}
        {frequencyType === "mois" && (
          <label className="block text-xs text-zinc-600 font-medium">
            Jour du mois
            <input
              type="number"
              min="1"
              max="31"
              value={monthDay}
              onChange={(e) => setMonthDay(e.target.value)}
              className="w-24 mt-1 rounded border border-zinc-200 p-2 text-sm text-zinc-800"
              placeholder="1"
            />
          </label>
        )}

        {/* Dates */}
        <div className="flex gap-2">
          <label className="flex-1 block text-xs text-zinc-600 font-medium">
            À partir du
            <input
              type="date"
              className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="flex-1 block text-xs text-zinc-600 font-medium">
            Jusqu&apos;au
            <input
              type="date"
              className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>

        {/* Résumé stylé */}
        {message && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-md text-center space-y-2">
            <p className="text-xl font-bold text-[#9600ff]">{tasks.length} tâches</p>
            <p className="text-sm text-zinc-700 whitespace-pre-line">{message}</p>
          </div>
        )}

        {/* Database ID + API Key */}
        <div className="flex gap-2">
          <label className="flex-1 block text-xs text-zinc-600 font-medium">
            Database ID
            <input
              type="text"
              placeholder="ex: 35f908ccf..."
              className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
              value={databaseId}
              onChange={(e) => {
                setDatabaseId(e.target.value);
                setSchema(null);
                setSchemaError("");
              }}
            />
          </label>

          <label className="flex-1 block text-xs text-zinc-600 font-medium">
            API Key
            <input
              type="password"
              placeholder="ex: secret_ABC..."
              className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSchema(null);
                setSchemaError("");
              }}
            />
          </label>
        </div>

        {/* Lien d’aide */}
        <div className="mt-2">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="text-xs text-[#9600ff] underline hover:opacity-80"
          >
            ℹ️ Comment trouver mon Database ID et mon API Key ?
          </button>

          {showHelp && (
            <div className="mt-2 p-3 border rounded-lg bg-zinc-50 text-xs text-zinc-700 space-y-2 text-left">
              <p>
                🔑 <b>API Key</b> : Va sur{" "}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#9600ff] underline"
                >
                  notion.so/my-integrations
                </a>{" "}
                → <i>New integration</i> → copie la clé (commence souvent par <code>secret_</code>).
              </p>
              <p>
                ⚡️ <b>Connexion</b> : Dans ta base Notion → “...” → <i>Connexion</i> → ajoute ton intégration.
              </p>
              <p>
                📂 <b>Database ID</b> : Dans l’URL de ta base, copie la longue suite après <code>notion.so/</code> et avant <code>?</code>.
              </p>
            </div>
          )}
        </div>

        {/* Bouton récupérer champs */}
        <button
          onClick={fetchSchema}
          className="w-full flex items-center justify-center gap-2 border border-zinc-200 bg-white text-zinc-800 font-semibold py-2.5 rounded-lg shadow-sm hover:bg-zinc-50 transition"
        >
          {schemaLoading ? "⏳ Récupération des champs…" : "🧩 Récupérer les champs de la base"}
        </button>

        {schemaError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {schemaError}
          </div>
        )}

        {/* Mapping + champs auto */}
        {schema && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
            <p className="text-sm font-bold text-zinc-800">✅ Champs détectés</p>

            {/* Select title/date */}
            <div className="grid grid-cols-1 gap-2">
              <label className="block text-xs text-zinc-600 font-medium">
                Champ “Title” (obligatoire)
                <select
                  value={titlePropKey}
                  onChange={(e) => setTitlePropKey(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
                >
                  <option value="">— Choisir —</option>
                  {titleKeys.map((k) => (
                    <option key={k} value={k}>
                      {schema.properties[k].name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-zinc-600 font-medium">
                Champ “Date” (optionnel)
                <select
                  value={datePropKey}
                  onChange={(e) => setDatePropKey(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
                >
                  <option value="">— Aucun —</option>
                  {dateKeys.map((k) => (
                    <option key={k} value={k}>
                      {schema.properties[k].name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Extra defaults */}
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">
                (Optionnel) Valeurs par défaut pour les autres champs — appliquées à toutes les tâches.
              </p>

              <div className="space-y-3">
                {extraKeys.map((k) => renderExtraField(k))}
              </div>

              <p className="text-[11px] text-zinc-400">
                Note : certains types Notion ne sont pas affichés (relation, people, formula, rollup…).
              </p>
            </div>
          </div>
        )}

        {/* Bouton Envoyer */}
        <button
          onClick={sendToNotion}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#9600ff] to-[#ed0ecf] text-white font-semibold py-2.5 rounded-lg shadow hover:opacity-90 transition"
        >
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/e/e9/Notion-logo.svg"
            alt="Notion"
            className="w-5 h-5 invert"
          />
          Envoyer à Notion
        </button>

        <p className="text-xs text-zinc-500 text-center mt-1">
          Les tâches sont générées automatiquement, puis envoyées dans Notion.
        </p>
      </div>
    </div>
  );
}
