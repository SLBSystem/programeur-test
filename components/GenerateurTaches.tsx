"use client";

import React, { useState, useEffect } from "react";

export default function GenerateurTaches() {
  const [taskName, setTaskName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tasks, setTasks] = useState<string[]>([]);
  const [databaseId, setDatabaseId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [frequency, setFrequency] = useState("1");
  const [frequencyType, setFrequencyType] = useState("jour");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [monthDay, setMonthDay] = useState("1");
  const [showHelp, setShowHelp] = useState(false);

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  // Génération auto
  useEffect(() => {
    if (!taskName || !startDate || !endDate) {
      setTasks([]);
      setMessage("");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      setTasks([]);
      setMessage("⚠️ Dates invalides");
      return;
    }

    const result: string[] = [];
    let current = new Date(start);

    while (current <= end) {
      if (frequencyType === "jour") {
        result.push(`${taskName} — ${current.toLocaleDateString("fr-FR")}`);
        current.setDate(current.getDate() + parseInt(frequency, 10));
      } else if (frequencyType === "semaine") {
        if (selectedDays.includes(current.getDay().toString())) {
          result.push(`${taskName} — ${current.toLocaleDateString("fr-FR")}`);
        }
        current.setDate(current.getDate() + 1);
      } else if (frequencyType === "mois") {
        if (current.getDate() === parseInt(monthDay, 10)) {
          result.push(`${taskName} — ${current.toLocaleDateString("fr-FR")}`);
        }
        current.setDate(current.getDate() + 1);
      }
    }

    setTasks(result);

    if (result.length > 0) {
      let freqText = "";
      if (frequencyType === "jour") {
        freqText = `tous les ${frequency} jour(s)`;
      } else if (frequencyType === "semaine") {
        const jours = selectedDays
          .map((d) => ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"][parseInt(d, 10)])
          .join(", ");
        freqText = `chaque ${jours}`;
      } else if (frequencyType === "mois") {
        freqText = `le ${monthDay} de chaque mois`;
      }

      setMessage(
        `📌 ${result.length} tâches **${taskName}**\n${freqText}\nDu ${start.toLocaleDateString("fr-FR")} au ${end.toLocaleDateString("fr-FR")}`
      );
    } else {
      setMessage("");
    }
  }, [taskName, startDate, endDate, frequency, frequencyType, selectedDays, monthDay]);

  // Envoi à Notion
  async function sendToNotion() {
    if (!databaseId || !apiKey || tasks.length === 0) {
      setMessage("⚠️ Fournis Database ID, API Key et remplis les infos avant d'envoyer.");
      return;
    }

    try {
      const res = await fetch("/api/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseId, apiKey, tasks }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(`❌ Échec envoi Notion : ${data.message || "Erreur API"}`);
        console.error("Erreur Notion:", data.details || data);
        return;
      }

      setMessage("✅ Tâches envoyées dans Notion !");
    } catch (err) {
      console.error(err);
      setMessage("❌ Erreur réseau ou serveur");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/90 rounded-2xl shadow-lg ring-1 ring-zinc-200 p-5 space-y-4">
        {/* Titre */}
        <h1 className="text-lg font-bold text-zinc-800 text-center">
          📝 Le Programmeur de Récurrence
        </h1>
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
              onChange={(e) => setFrequencyType(e.target.value)}
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
                key={i}
                type="button"
                onClick={() => toggleDay(d)}
                className={`flex-1 rounded-lg py-1 text-xs border ${
                  selectedDays.includes(d)
                    ? "bg-[#9600ff] text-white"
                    : "bg-white text-zinc-600"
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
            Jusqu'au
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
            <p className="text-xl font-bold text-[#9600ff]">
              {tasks.length} tâches
            </p>
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
              onChange={(e) => setDatabaseId(e.target.value)}
            />
          </label>

          <label className="flex-1 block text-xs text-zinc-600 font-medium">
            API Key
            <input
              type="password"
              placeholder="ex: cfs_ABC..."
              className="w-full mt-1 rounded-lg border border-zinc-200 p-2 text-sm text-zinc-800"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
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
    </a>
    , clique sur <i>New integration</i>, donne un nom (ex : <i>Tâches récurrentes</i>), sélectionne ton espace Notion, laisse
    "Interne", valide, puis copie la clé secrète qui s’affiche (elle commence par <code>secret_...</code>).
  </p>

  <p>
    ⚡️ <b>Connexion</b> : Dans ta base Notion (la BDD elle-même, pas la page qui la contient), clique sur les “...” en haut à
    droite → <i>Connexion</i> → cherche ton intégration créée (ex : <i>Tâches récurrentes</i>) et ajoute-la.
  </p>

  <p>
    📂 <b>Database ID</b> : Regarde l’URL de ta base dans ton navigateur et copie la longue suite après{" "}
    "<code>notion.so/</code>" et avant le "<code>?</code>". <br />
    Comme ça :{" "}
    <code>
      https://www.notion.so/ton-espace/<b><u>84eae0b1445cabeb6d6c522d734f6</u></b>?v=6166a1bbc4a841bb9dee96a8a8923696
    </code>
  </p>
            </div>
          )}
        </div>

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

        {/* Explication */}
        <p className="text-xs text-zinc-500 text-center mt-1">
          Les tâches sont générées automatiquement selon la fréquence choisie,
          puis envoyées dans Notion.
        </p>
      </div>
    </div>
  );
}
