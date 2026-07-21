/* Fonction serveur SDZ App — consultation du statut d'un travail de génération d'image.
   Appelée par le client toutes les 2-3 secondes pendant le polling. Ne fait jamais d'appel OpenAI. */
const { getStore } = require("@netlify/blobs");

const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — au-delà, un job est considéré périmé (ignoré, pas supprimé)
const PROCESSING_TIMEOUT_MS = 16 * 60 * 1000; // Background Function plafonnée à 15 min (doc Netlify) —
                                                // 16 min laisse une marge avant de considérer le job bloqué

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
    const raw = await store.get(`jobs/${jobId}`);
    if (!raw) {
      return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Travail introuvable" }) };
    }
    const job = JSON.parse(raw);

    if (Date.now() - job.createdAt > JOB_MAX_AGE_MS) {
      return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Travail expiré (plus de 24h)" }) };
    }

    // Job resté "processing" au-delà de la durée maximale réaliste de la Background Function
    // (15 min documentée) : on le bascule en failed plutôt que de laisser le client attendre
    // jusqu'à son propre délai de 10 minutes sans jamais recevoir d'explication claire.
    if (job.status === "processing" && (Date.now() - (job.updatedAt || job.createdAt)) > PROCESSING_TIMEOUT_MS) {
      const timedOutJob = {
        ...job,
        status: "failed",
        updatedAt: Date.now(),
        error: { message: "La génération a dépassé la durée maximale autorisée.", source: "timeout" },
      };
      try { await store.set(`jobs/${jobId}`, JSON.stringify(timedOutJob)); } catch (e) { /* on répond quand même avec le statut calculé */ }
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, jobId, status: "failed", error: timedOutJob.error }) };
    }

    if (job.status === "failed") {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, jobId, status: "failed", error: job.error }) };
    }

    if (job.status === "completed" && job.resultKey) {
      // Le résultat (base64) n'est jamais lu ni renvoyé ici — le polling de statut doit rester léger.
      // Le client récupère l'image séparément via get-image-result.
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true, jobId, status: "completed",
          result: {
            resultUrl: `/.netlify/functions/get-image-result?jobId=${encodeURIComponent(jobId)}`,
            usedReference: !!job.usedReference,
            referenceFallbackReason: job.referenceFallbackReason || null,
            usage: job.usage || null,
          },
        }),
      };
    }

    // queued ou processing (récent)
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, jobId, status: job.status }) };
  } catch (err) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
