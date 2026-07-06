/* Fonction serveur Viewfinder — sauvegarde explicite ("Sauvegarder sur serveur").
   Écrit chaque clé fournie dans le magasin Netlify Blobs "viewfinder-data".
   N'accepte que les clés de la liste blanche ci-dessous : jamais les clés API,
   jamais les images (trop lourdes pour ce stockage, exclues volontairement). */
const { getStore } = require("@netlify/blobs");

const ALLOWED_KEYS = [
  "vf-modules", "vf-styles", "vf-da", "vf-history",
  "vf-audit", "vf-lab", "vf-api-providers", "vf-modes", "vf-campaign", "vf-scheduled", "vf-make-webhook",
];

/* L'injection automatique du contexte Netlify Blobs (siteID/token) s'est révélée peu fiable
   sur ce type de fonction — on fournit donc les identifiants explicitement, via deux variables
   d'environnement à créer sur Netlify : BLOBS_SITE_ID et BLOBS_TOKEN (voir MIGRATION.md). */
function openStore(){
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-data", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });
  }
  return getStore("viewfinder-data");
}

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
  try {
    const { data, updatedAt } = JSON.parse(event.body || "{}");
    if (!data || typeof data !== "object") {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Aucune donnée fournie" }) };
    }
    const store = openStore();
    let saved = 0;
    for (const key of ALLOWED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        await store.set(key, JSON.stringify(data[key]));
        saved++;
      }
    }
    const finalUpdatedAt = Number(updatedAt) || Date.now();
    await store.set("vf-updated-at", JSON.stringify(finalUpdatedAt));
    await store.set("vf-last-sync", JSON.stringify(new Date().toISOString()));
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, saved, updatedAt: finalUpdatedAt }) };
  } catch (err) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
