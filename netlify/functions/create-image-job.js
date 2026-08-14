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
const { planV3, validatePreparedPlan } = require("./_shared/v3-pipeline");
const {costMode,selectedReferenceRoles,buildCostAudit}=require("./_shared/v3-cost-control");
const {getPsioStatus,getPsioReferencesForRoles}=require("./_shared/v3-psio-references");

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
  const mode=costMode(payload.costMode||"test");
  if(mode.id==="recompose")throw new Error("La recomposition doit utiliser l’endpoint gratuit dédié.");
  if(mode.requiresConfirmation&&payload.costConfirmed!==true)throw new Error(`Confirmation explicite requise pour le coût estimé (${mode.estimatedPhotoEur.toFixed(2)} €).`);
  if(payload.v3Plan){v3Plan=validatePreparedPlan(payload.v3Plan);prompt=v3Plan.photoBrief.prompt;}else if(payload.v3){v3Plan=planV3(payload.v3);prompt=v3Plan.photoBrief.prompt;}
  if(v3Plan&&v3Plan.costMode!==mode.id)throw new Error(`Incohérence de coût : plan ${v3Plan.costMode}, confirmation ${mode.id}.`);
  if(mode.id==="test"&&quality&&quality!==mode.quality)throw new Error("Incohérence de coût : Mode Test demandé, qualité haute détectée");
  if(typeof prompt!=="string"||!prompt.trim())throw new Error("Le prompt est requis");
  const referenceImageCount=(referenceImageUrls||[]).length+(referenceImageData||[]).length;
  const effectiveSize=size||"1024x1024";
  const referenceRoles=selectedReferenceRoles(mode.id,referenceImageCount?["profile_worn","front_worn","product"].slice(0,referenceImageCount):[]);
  const costAudit=buildCostAudit({mode:mode.id,referenceImageCount,referenceRoles,requestedQuality:quality||mode.quality,requestedSize:size||"1024x1024",effectiveSize});
  if(costAudit.requiresAdditionalConfirmation&&payload.costCeilingConfirmed!==true)throw new Error(`Confirmation supplémentaire requise : total prudent maximal ${costAudit.estimatedTotalMax.toFixed(3)} €.`);
  return {prompt,size:effectiveSize,model:model||"gpt-image-2",quality:mode.quality,requestedQuality:quality||mode.quality,effectiveQuality:mode.quality,requestedSize:size||"1024x1024",effectiveSize,costMode:mode.id,referenceImageUrls,referenceImageData,referenceRoles,referenceRequired:payload.referenceRequired===true,brandComposition,v3Plan,clientRequestId:String(payload.clientRequestId||""),costAudit};
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
  if(input.v3Plan?.psioRequired){let status,persistent;try{status=await getPsioStatus(true);const roles=selectedReferenceRoles(input.costMode,status.psioReferenceRoles.filter(x=>x.available).map(x=>x.role));persistent=await getPsioReferencesForRoles(roles);input.referenceRoles=roles;}catch(error){return {statusCode:503,headers:{"Content-Type":"application/json"},body:JSON.stringify({error:`Stockage PSiO® inaccessible : ${String(error.message||error)}`,imageGenerationCallCount:0})};}if(!status.psioReferenceReady||!persistent.length)return {statusCode:409,headers:{"Content-Type":"application/json"},body:JSON.stringify({error:"Références officielles PSiO® incomplètes — aucun job créé.",psioReferenceReady:false,psioReferenceCount:status.psioReferenceCount,imageGenerationCallCount:0})};input.referenceImageUrls=[];input.referenceImageData=persistent.map(x=>x.dataUrl);input.referenceRequired=true;input.costAudit=buildCostAudit({mode:input.costMode,referenceImageCount:persistent.length,referenceRoles:input.referenceRoles,requestedQuality:input.requestedQuality,requestedSize:input.requestedSize,effectiveSize:input.effectiveSize});if(input.costAudit.requiresAdditionalConfirmation&&payload.costCeilingConfirmed!==true)return {statusCode:428,headers:{"Content-Type":"application/json"},body:JSON.stringify({error:`Confirmation supplémentaire requise : total prudent maximal ${input.costAudit.estimatedTotalMax.toFixed(3)} €.`,costAudit:input.costAudit,imageGenerationCallCount:0})};}
  const {prompt,size,model,quality,referenceImageUrls,referenceImageData,referenceRequired,brandComposition,v3Plan}=input;

  try {
    const jobId = crypto.randomUUID();
    const now = Date.now();
    const store = openJobStore();
    const idempotencyKey=input.clientRequestId||crypto.createHash("sha256").update(JSON.stringify({prompt:input.prompt,size:input.size,costMode:input.costMode,brandComposition:input.brandComposition})).digest("hex");
    const existingRaw=await store.get(`idempotency/${idempotencyKey}`);
    if(existingRaw){const existing=JSON.parse(existingRaw);return {statusCode:200,headers:{"Content-Type":"application/json"},body:JSON.stringify({ok:true,jobId:existing.jobId,status:existing.status||"queued",deduplicated:true})};}
    await store.set(`idempotency/${idempotencyKey}`,JSON.stringify({jobId,status:"queued",createdAt:now}));

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
      costAudit:input.costAudit,
      costMode:input.costMode,
      requestedQuality:input.requestedQuality,
      effectiveQuality:input.effectiveQuality,
      requestedSize:input.requestedSize,
      effectiveSize:input.effectiveSize,
      imageGenerationCallCount:0,
      idempotencyKey,
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
