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
        setSchemaError(`❌ Impossible de r
