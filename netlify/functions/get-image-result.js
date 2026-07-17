/* Fonction serveur SDZ App — récupération de l'image finale d'un travail de génération terminé.
   Séparée de get-image-job pour que le polling de statut reste léger (jamais de base64 dans le
   JSON de statut). Renvoie directement l'image binaire (PNG), jamais un JSON. */
const { getStore } = require("@netlify/blobs");

function openJobStore(){
  const opts = { consistency: "strong" };
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-image-jobs", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN, ...opts });
  }
  return getStore({ name: "viewfinder-image-jobs", ...opts });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const jobId = (event.queryStringParameters || {}).jobId;
  if (!jobId) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "jobId manquant" }) };
  }

  try {
    const store = openJobStore();
    const jobRaw = await store.get(`jobs/${jobId}`);
    if (!jobRaw) {
      return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Travail introuvable" }) };
    }
    const job = JSON.parse(jobRaw);
    if (job.status !== "completed" || !job.resultKey) {
      return { statusCode: 409, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: `Travail pas encore terminé (statut actuel : ${job.status})` }) };
    }

    const resultRaw = await store.get(job.resultKey);
    if (!resultRaw) {
      return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Résultat introuvable malgré un statut terminé." }) };
    }
    const result = JSON.parse(resultRaw);

    if (result.b64) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "image/png" },
        isBase64Encoded: true,
        body: result.b64,
      };
    }
    if (result.url) {
      // Le fournisseur a renvoyé une URL plutôt qu'un base64 (cas rare) — on redirige plutôt que
      // de re-télécharger l'image côté serveur, cela reste hors du périmètre de cette correction.
      return { statusCode: 302, headers: { Location: result.url } };
    }
    return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Aucune image disponible pour ce travail." }) };
  } catch (err) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
