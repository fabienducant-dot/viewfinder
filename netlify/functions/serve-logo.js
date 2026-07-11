/* Fonction serveur SDZ App — sert le vrai logo officiel comme une URL publique classique
   (/logo.png), pour qu'il puisse être utilisé comme véritable image de référence par les
   fournisseurs d'API qui acceptent une image en entrée, ou simplement affiché/vérifié.
   Volontairement sans secret requis, comme serve-image.js : une URL de logo n'a rien de
   sensible et doit rester accessible sans en-tête d'authentification. */
const { getStore } = require("@netlify/blobs");

function openStore(){
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-data", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });
  }
  return getStore("viewfinder-data");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const store = openStore();
    const raw = await store.get("vf-logo-asset");
    if (!raw) {
      return { statusCode: 404, body: "Aucun logo officiel n'a encore été défini (Bibliothèque → \"Définir comme logo officiel SDZ\")." };
    }
    const record = JSON.parse(raw);
    const match = (record.dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return { statusCode: 500, body: "Format de logo invalide en stockage." };
    }
    return {
      statusCode: 200,
      headers: {
        "Content-Type": match[1],
        "Cache-Control": "public, max-age=3600", // une heure : assez pour éviter les re-téléchargements répétés, assez court pour refléter une mise à jour du logo
      },
      body: match[2],
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: String(err.message || err) };
  }
};
