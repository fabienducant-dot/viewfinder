/* Fonction serveur SDZ App — création d'un travail de génération d'image (flux asynchrone).
   Remplace l'ancien generate-image.js synchrone : OpenAI (surtout /v1/images/edits avec
   référence) peut dépasser la limite d'exécution synchrone de Netlify (10-26s selon le plan),
   ce qui renvoyait une page HTML de timeout que le client tentait de parser en JSON.

   Cette fonction ne fait QUE : valider le payload, écrire l'entrée complète (prompt + références)
   dans Netlify Blobs, créer le job, déclencher process-image-job-background.js en ne lui
   transmettant QUE le jobId (jamais les références en base64 — la limite documentée des Background
   Functions est de 256 Ko de payload, largement dépassée par des images de référence), puis
   répondre immédiatement. Elle n'attend jamais OpenAI. */
const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");

function openJobStore(){
  const opts = { consistency: "strong" }; // écriture puis relecture quasi immédiate du statut : la
                                            // cohérence éventuelle par défaut de Blobs (jusqu'à 60s
                                            // de propagation) exposerait le client à un job "introuvable"
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-image-jobs", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN, ...opts });
  }
  return getStore({ name: "viewfinder-image-jobs", ...opts });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Corps de requête invalide" }) };
  }
  const { prompt, size, model, referenceImageUrls, referenceImageData } = payload;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Le prompt est requis" }) };
  }

  try {
    const jobId = crypto.randomUUID();
    const now = Date.now();
    const store = openJobStore();

    // Entrée complète (peut contenir jusqu'à 3 images en base64) écrite en Blobs — jamais transmise
    // telle quelle au déclenchement de la Background Function.
    await store.set(`jobs/${jobId}/input`, JSON.stringify({ prompt, size, model, referenceImageUrls, referenceImageData }));

    await store.set(`jobs/${jobId}`, JSON.stringify({
      jobId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      error: null,
      resultKey: null,
      usedReference: null,
      referenceFallbackReason: null,
    }));

    const siteUrl = (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
    if (!siteUrl) {
      await store.set(`jobs/${jobId}`, JSON.stringify({
        jobId, status: "failed", createdAt: now, updatedAt: Date.now(),
        error: { message: "SITE_URL/URL non disponible côté serveur — impossible de déclencher la génération.", source: "config" },
        resultKey: null, usedReference: null, referenceFallbackReason: null,
      }));
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, jobId, status: "failed" }) };
    }

    const imageJobSecret = process.env.IMAGE_JOB_SECRET;
    if (!imageJobSecret) {
      await store.set(`jobs/${jobId}`, JSON.stringify({
        jobId, status: "failed", createdAt: now, updatedAt: Date.now(),
        error: { message: "IMAGE_JOB_SECRET non configuré côté serveur — la génération ne peut pas être déclenchée en sécurité.", source: "config" },
        resultKey: null, usedReference: null, referenceFallbackReason: null,
      }));
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, jobId, status: "failed" }) };
    }

    // Déclenche la Background Function par une requête HTTP vers son propre endpoint — Netlify
    // répond exactement 202 à CET appel (immédiat, avant que la génération elle-même ne commence),
    // donc attendre cette réponse ne bloque pas sur la durée de la génération. Le corps ne contient
    // QUE le jobId : le payload complet (potentiellement plusieurs Mo avec des références en base64)
    // reste en Blobs, jamais dans une invocation de Background Function (limite documentée : 256 Ko).
    try {
      const triggerRes = await fetch(`${siteUrl}/.netlify/functions/process-image-job-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-image-job-secret": imageJobSecret },
        body: JSON.stringify({ jobId }),
      });
      if (triggerRes.status !== 202) {
        const triggerBody = await triggerRes.text();
        await store.set(`jobs/${jobId}`, JSON.stringify({
          jobId, status: "failed", createdAt: now, updatedAt: Date.now(),
          error: { message: `Déclenchement de la génération refusé (statut ${triggerRes.status}) : ${triggerBody.slice(0, 300)}`, source: "trigger" },
          resultKey: null, usedReference: null, referenceFallbackReason: null,
        }));
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, jobId, status: "failed" }) };
      }
    } catch (triggerErr) {
      await store.set(`jobs/${jobId}`, JSON.stringify({
        jobId, status: "failed", createdAt: now, updatedAt: Date.now(),
        error: { message: `Échec du déclenchement de la génération : ${String(triggerErr.message || triggerErr)}`, source: "trigger" },
        resultKey: null, usedReference: null, referenceFallbackReason: null,
      }));
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, jobId, status: "failed" }) };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, jobId, status: "queued" }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
