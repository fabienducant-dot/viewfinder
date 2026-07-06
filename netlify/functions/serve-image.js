/* Fonction serveur Viewfinder — sert l'image d'un post programmé comme une URL publique classique.
   Nécessaire car les modules Instagram / Facebook / Google Business de Make attendent une URL
   qu'ils vont chercher eux-mêmes, pas des données brutes envoyées dans le corps du webhook.

   Appelée uniquement par Make (ou tout autre outil) au moment de la publication — jamais par
   Viewfinder lui-même. Volontairement sans secret requis : Instagram/Facebook doivent pouvoir
   la récupérer sans en-tête d'authentification, et l'identifiant du post (aléatoire, non
   devinable) sert déjà de protection suffisante pour une image destinée à être publiée. */
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
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) {
    return { statusCode: 400, body: "Paramètre 'id' manquant" };
  }
  const cleanId = id.replace(/\.[a-zA-Z0-9]+$/, ""); // tolère un suffixe genre ".jpg" ajouté pour Instagram/Make

  try {
    const store = openStore();
    const scheduledRaw = await store.get("vf-scheduled");
    const scheduled = scheduledRaw ? JSON.parse(scheduledRaw) : [];
    const post = scheduled.find((p) => p.id === cleanId);

    if (!post || !post.imageDataUrl) {
      return { statusCode: 404, body: "Image introuvable pour cet identifiant" };
    }

    const match = post.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return { statusCode: 500, body: "Format d'image invalide" };
    }
    const contentType = match[1];
    const base64Data = match[2];

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
      body: base64Data,
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: String(err.message || err) };
  }
};
