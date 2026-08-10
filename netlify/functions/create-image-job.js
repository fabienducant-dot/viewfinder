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
const { resolveInvocationBaseUrl } = require("./_shared/netlify-invocation-url");
const { planV3 } = require("./_shared/v3-pipeline");

function openJobStore(){
  const opts = { consistency: "strong" }; // écriture puis relecture quasi immédiate du statut : la
                                            // cohérence éventuelle par défaut de Blobs (jusqu'à 60s
                                            // de propagation) exposerait le client à un job "introuvable"
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-image-jobs", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN, ...opts });
  }
  return getStore({ name: "viewfinder-image-jobs", ...opts });
}

function buildJobInput(payload){
  let {prompt,size,model,quality,referenceImageUrls,referenceImageData,brandComposition}=payload;
  let v3Plan=null;
  if(payload.v3){v3Plan=planV3(payload.v3);prompt=v3Plan.photoBrief.prompt;}
  if(typeof prompt!=="string"||!prompt.trim())throw new Error("Le prompt est requis");
  return {prompt,size,model,quality,referenceImageUrls,referenceImageData,referenceRequired:payload.referenceRequired===true,brandComposition,v3Plan};
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
  let input;
  try{input=buildJobInput(payload);}catch(error){return {statusCode:400,headers:{"Content-Type":"application/json"},body:JSON.stringify({error:String(error.message||error)})};}
  const {prompt,size,model,quality,referenceImageUrls,referenceImageData,referenceRequired,brandComposition,v3Plan}=input;

  try {
    const jobId = crypto.randomUUID();
    const now = Date.now();
    const store = openJobStore();

    // Entrée complète (peut contenir jusqu'à 4 images en base64) écrite en Blobs — jamais transmise
    // telle quelle au déclenchement de la Background Function.
    await store.set(`jobs/${jobId}/input`, JSON.stringify(input));

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

    // Le job doit déclencher la Background Function du MÊME déploiement. Sur une Deploy Preview,
    // URL/SITE_URL peuvent pointer vers la production ; l'hôte Netlify validé de la requête
    // entrante reste donc prioritaire.
    const siteUrl = resolveInvocationBaseUrl(event);
    if (!siteUrl) {
      await store.set(`jobs/${jobId}`, JSON.stringify({
        jobId, status: "failed", createdAt: now, updatedAt: Date.now(),
        error: { message: "Hôte du déploiement Netlify introuvable — impossible de déclencher la génération.", source: "config" },
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

exports.buildJobInput=buildJobInput;
