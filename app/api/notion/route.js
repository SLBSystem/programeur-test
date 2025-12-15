export async function POST(req) {
  try {
    const { databaseId, apiKey, tasks } = await req.json();
    if (!databaseId || !apiKey || !tasks) {
      return new Response(
        JSON.stringify({ error: true, message: "⚠️ API Key, Database ID ou tâches manquantes." }),
        { status: 400 }
      );
    }

    // 1) Lire le schéma de la base pour trouver les bons champs
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
      },
    });
    if (!dbRes.ok) {
      const t = await dbRes.text();
      return new Response(JSON.stringify({ error: true, message: "❌ Impossible de lire la base Notion", details: t }), { status: 500 });
    }
    const dbSchema = await dbRes.json();

    // champ title possible: taches, tâche, tâches, tache, nom, name (insensible à la casse)
    const candidates = ["taches","tâches","tache","tâche","nom","name"];
    let titleProp = null;
    for (const key in dbSchema.properties) {
      if (candidates.includes(key.toLowerCase()) && dbSchema.properties[key].type === "title") {
        titleProp = key;
        break;
      }
    }
    if (!titleProp) {
      return new Response(JSON.stringify({ error: true, message: "❌ Aucun champ Title trouvé (taches/tâche/nom/name)." }), { status: 400 });
    }

    // champ date: propriété dont le nom (insensible à la casse) est "date" et type "date"
    let dateProp = null;
    for (const key in dbSchema.properties) {
      if (key.toLowerCase() === "date" && dbSchema.properties[key].type === "date") {
        dateProp = key;
        break;
      }
    }
    if (!dateProp) {
      return new Response(JSON.stringify({ error: true, message: "❌ Aucun champ 'Date' (type date) trouvé dans la base." }), { status: 400 });
    }

    // 2) Parser dd/mm/yyyy -> yyyy-mm-dd (ISO) pour éviter l'inversion jour/mois
    const parseFrDateToISO = (s) => {
      if (!s) return null;
      const parts = s.split("/");
      if (parts.length !== 3) return null;
      const [dd, mm, yyyy] = parts.map((x) => parseInt(x, 10));
      if (!dd || !mm || !yyyy) return null;
      // Créer une date en UTC pour ne pas perdre un jour selon timezone
      const iso = new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString().slice(0, 10); // yyyy-mm-dd
      return iso;
    };

    // 3) Créer les pages
    for (const task of tasks) {
      // format attendu côté front: "Titre — dd/mm/yyyy"
      const [titlePartRaw, datePartRaw] = String(task).split(" — ");
      const titlePart = (titlePartRaw || "").trim();
      const dateISO = parseFrDateToISO((datePartRaw || "").trim());

      const properties = {
        [titleProp]: { title: [{ text: { content: titlePart } }] },
      };
      if (dateISO) properties[dateProp] = { date: { start: dateISO } };

      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return new Response(JSON.stringify({ error: true, message: "❌ Erreur envoi Notion", details: errorText }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ success: true, message: "✅ Tâches envoyées dans Notion !" }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: "❌ Erreur serveur", details: err.message }), { status: 500 });
  }
}
