/* Fonction serveur Viewfinder — lecture explicite ("Restaurer depuis serveur").
   Renvoie toutes les clés disponibles dans le magasin Netlify Blobs "viewfinder-data". */
const { getStore } = require("@netlify/blobs");

const ALLOWED_KEYS = [
  "vf-modules", "vf-styles", "vf-da", "vf-history",
  "vf-audit", "vf-lab", "vf-api-providers", "vf-modes", "vf-campaign",
];

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  if (process.env.SYNC_SECRET) {
    const provided = event.headers["x-sync-secret"] || event.headers["X-Sync-Secret"];
    if (provided !== process.env.SYNC_SECRET) {
      return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Secret de synchronisation invalide" }) };
    }
  }
  try {
    const store = getStore("viewfinder-data");
    const data = {};
    for (const key of ALLOWED_KEYS) {
      const raw = await store.get(key);
      if (raw) data[key] = JSON.parse(raw);
    }
    const lastSyncRaw = await store.get("vf-last-sync");
    const updatedAtRaw = await store.get("vf-updated-at");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data,
        lastSync: lastSyncRaw ? JSON.parse(lastSyncRaw) : null,
        updatedAt: updatedAtRaw ? Number(JSON.parse(updatedAtRaw)) : null,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
