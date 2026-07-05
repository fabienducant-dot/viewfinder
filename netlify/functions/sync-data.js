/* Fonction serveur Viewfinder — synchronisation ("Synchroniser maintenant").
   Compare l'horodatage local (envoyé par le client) à l'horodatage stocké côté serveur :
   - si le local est plus récent (ou qu'aucune donnée serveur n'existe encore) : on pousse le local.
   - si le serveur est plus récent : on renvoie ses données pour que le client les adopte.
   Aucune fusion champ par champ — la version la plus récente l'emporte dans son ensemble,
   pour rester simple et prévisible. */
const { getStore } = require("@netlify/blobs");

const ALLOWED_KEYS = [
  "vf-modules", "vf-styles", "vf-da", "vf-history",
  "vf-audit", "vf-lab", "vf-api-providers", "vf-modes", "vf-campaign",
];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  if (process.env.SYNC_SECRET) {
    const provided = event.headers["x-sync-secret"] || event.headers["X-Sync-Secret"];
    if (provided !== process.env.SYNC_SECRET) {
      return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Secret de synchronisation invalide" }) };
    }
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Corps de requête invalide" }) };
  }
  const clientData = body.data && typeof body.data === "object" ? body.data : {};
  const clientUpdatedAt = Number(body.updatedAt) || 0;

  try {
    const store = getStore("viewfinder-data");
    const remoteUpdatedAtRaw = await store.get("vf-updated-at");
    const remoteUpdatedAt = remoteUpdatedAtRaw ? Number(JSON.parse(remoteUpdatedAtRaw)) : 0;

    if (!remoteUpdatedAt || clientUpdatedAt >= remoteUpdatedAt) {
      // Le local est au moins aussi récent (ou rien n'existe encore côté serveur) : on pousse.
      for (const key of ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(clientData, key)) {
          await store.set(key, JSON.stringify(clientData[key]));
        }
      }
      const newUpdatedAt = clientUpdatedAt || Date.now();
      await store.set("vf-updated-at", JSON.stringify(newUpdatedAt));
      await store.set("vf-last-sync", JSON.stringify(new Date().toISOString()));
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: remoteUpdatedAt ? "pushed" : "pushed-initial", updatedAt: newUpdatedAt }),
      };
    }

    // Le serveur est strictement plus récent : le client doit adopter ses données.
    const remoteData = {};
    for (const key of ALLOWED_KEYS) {
      const raw = await store.get(key);
      if (raw) remoteData[key] = JSON.parse(raw);
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pull", data: remoteData, updatedAt: remoteUpdatedAt }),
    };
  } catch (err) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
