/* Fonction serveur SDZ App — enregistre le vrai logo officiel de la marque comme actif de référence
   unique, séparé de la synchronisation JSON générale (comme pour les images de posts, on évite
   volontairement d'alourdir le payload de sync à chaque sauvegarde). Un seul logo à la fois :
   chaque appel remplace le précédent, jamais de duplication de fichier. */
const { getStore } = require("@netlify/blobs");

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
    const { dataUrl } = JSON.parse(event.body || "{}");
    if (!dataUrl || !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "dataUrl manquant ou invalide (attendu : image encodée en base64)" }) };
    }
    const store = openStore();
    const record = { dataUrl, updatedAt: Date.now() };
    await store.set("vf-logo-asset", JSON.stringify(record));
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, updatedAt: record.updatedAt }) };
  } catch (err) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
