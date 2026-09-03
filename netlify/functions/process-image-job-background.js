/* Background Function Netlify — exécute réellement l'appel OpenAI, jusqu'à 15 minutes,
   sans jamais bloquer de connexion HTTP client. Reconnue par Netlify grâce au suffixe
   "-background" du nom de fichier (aucune configuration supplémentaire requise).

   Sécurité : n'accepte que les requêtes internes portant l'en-tête x-image-job-secret
   correspondant à la variable d'environnement IMAGE_JOB_SECRET — sans quoi n'importe qui
   connaissant l'URL pourrait déclencher directement des générations OpenAI facturées.

   Robustesse : l'intégralité du traitement (ouverture du store, lecture de l'entrée, appel
   OpenAI, écriture du résultat) est protégée contre toute exception non interceptée, pour ne
   jamais déclencher le retry automatique de Netlify sur une Background Function en échec
   (documenté : une invocation en erreur est retentée après 1 min, puis 2 min) — ce qui
   provoquerait un second appel OpenAI facturé pour le même job. Une protection d'idempotence
   complète également ce garde-fou : un job déjà completed/failed/processing-récent n'est jamais
   retraité. */
const { getStore } = require("@netlify/blobs");
const { applyImageEditOptions } = require("./_shared/openai-image-edit-options");
const { composeBrandPoster } = require("./_shared/brand-compositor");
const { analyzeImageWithOpenAI } = require("./_shared/v3-image-analyzer");
const { executeV3Pipeline } = require("./_shared/v3-executor");
const {buildCostAudit}=require("./_shared/v3-cost-control");
const {artisticFingerprint}=require("./_shared/v3-pipeline");

const PROCESSING_RECENT_THRESHOLD_MS = 14 * 60 * 1000; // en dessous, on suppose qu'une autre
                                                          // invocation traite déjà ce job

function openJobStore(){
  const opts = { consistency: "strong" };
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-image-jobs", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN, ...opts });
  }
  return getStore({ name: "viewfinder-image-jobs", ...opts });
}

function openBrandStore(){
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-data", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN, consistency: "strong" });
  }
  return getStore({ name: "viewfinder-data", consistency: "strong" });
}

async function generatedImageToBuffer(b64, url){
  if(b64) return Buffer.from(b64, "base64");
  if(!url) throw new Error("Aucune image reçue du fournisseur.");
  const response = await fetch(url);
  if(!response.ok) throw new Error(`Téléchargement de l'image OpenAI impossible (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function safeSetJobStatus(store, jobId, patch){
  // Ne laisse jamais une écriture de statut, même dans un bloc catch, remonter comme exception
  // non interceptée — sinon Netlify pourrait considérer l'invocation entière en échec et la
  // retenter automatiquement (voir doc citée en tête de fichier).
  try {
    const raw = await store.get(`jobs/${jobId}`);
    const current = raw ? JSON.parse(raw) : { jobId, createdAt: Date.now() };
    const next = { ...current, ...patch, jobId, updatedAt: Date.now() };
    await store.set(`jobs/${jobId}`, JSON.stringify(next));
    return next;
  } catch (writeErr) {
    console.error(`[process-image-job-background] Échec d'écriture du statut pour ${jobId} : ${String(writeErr.message || writeErr)}`);
    return null;
  }
}

async function fetchAsBlob(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Impossible de récupérer l'image de référence (${res.status})`);
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/png";
  return new Blob([buf], { type: contentType });
}

function dataUrlToBlob(dataUrl){
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if(!match) throw new Error("Image de référence en base64 invalide");
  const contentType = match[1];
  const binary = Buffer.from(match[2], "base64");
  return new Blob([binary], { type: contentType });
}

async function generateWithReferenceImages({ key, prompt, size, model, quality, referenceImageUrls, referenceImageData }){
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("size", size || "1024x1024");
  form.append("n", "1");
  applyImageEditOptions(form, { model, quality });
  // PSiO® utilise trois vues produit ; une quatrième vue peut rester disponible pour une référence
  // de scène fournie par l'utilisateur. L'identité SDZ est composée ensuite, hors du modèle.
  const urls = (referenceImageUrls || []).slice(0, 4);
  const dataUrls = (referenceImageData || []).slice(0, 4 - urls.length);
  for(const url of urls){
    const blob = await fetchAsBlob(url);
    form.append("image[]", blob, "reference.png");
  }
  for(const dataUrl of dataUrls){
    const blob = dataUrlToBlob(dataUrl);
    form.append("image[]", blob, "campaign-reference.png");
  }
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if(!res.ok){
    const errText = await res.text();
    throw new Error(`OpenAI Images (edits) a répondu ${res.status} : ${errText.slice(0, 300)}`);
  }
  return res.json();
}

async function generateStandard({ key, prompt, size, model, quality }){
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model || "gpt-image-2",
      prompt,
      size: size || "1024x1024",
      ...(quality ? { quality } : {}),
      n: 1,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Images a répondu ${res.status} : ${errText.slice(0, 300)}`);
  }
  return res.json();
}

function isProviderSafetyRejection(error){
  const text=String(error?.message||error||"");
  return /safety system|safety_violations|image_generation_user_error/i.test(text);
}

function bodyworkSafetyFallbackEligible(v3Plan){
  const type=String(v3Plan?.contract?.type||"").toLowerCase();
  return /massage|drainage|réflexologie/.test(type);
}

function buildProviderSafeBodyworkPrompt(v3Plan){
  const subject=String(v3Plan?.subjectBrief?.exactUserRequest||v3Plan?.subjectBrief?.coreTheme||"tension du haut du dos").replace(/\s+/g," ").trim();
  const focus=String(v3Plan?.subjectBrief?.requestedFocus||"haut du dos et épaules").replace(/\s+/g," ").trim();
  const active=v3Plan?.artDirection?.activeRegisters||{};
  const architecture=active.architectural ? "Architecture noire et or profonde, crédible, avec une ouverture vers un paysage ample et lumineux." : "Studio de bien-être premium noir et or, sobre, crédible et spacieux.";
  const fantastic=active.fantastic ? "Le registre fantastique vient uniquement de la profondeur, de la lumière, de l’échelle et du paysage, de manière photographique et crédible." : "";
  return [
    "Photographie éditoriale premium pour un cabinet de bien-être professionnel.",
    `Sujet : ${subject}.`,
    `Focus visuel : ${focus}.`,
    "Montrer deux adultes entièrement habillés dans des vêtements opaques et professionnels.",
    "Le bénéficiaire porte un haut noir opaque et reste assis ou debout ; sa posture du haut du dos et des épaules exprime clairement la tension et la lourdeur.",
    "Le praticien masculin porte une tenue professionnelle noire et se tient à proximité dans une posture d’accompagnement neutre, sans contact physique.",
    architecture,
    fantastic,
    "Photographie cinématographique noir et or, détails lisibles, profondeur réaliste, luxe silencieux, jamais illustration ni 3D.",
    "Générer uniquement la scène photographique, sans texte, logo, signature, URL, badge ni pictogramme."
  ].filter(Boolean).join("\n");
}

exports.handler = async (event) => {
  // --- Sécurité : secret partagé, vérifié avant toute autre action ---
  const providedSecret = (event.headers && (event.headers["x-image-job-secret"] || event.headers["X-Image-Job-Secret"])) || "";
  const expectedSecret = process.env.IMAGE_JOB_SECRET;
  if (!expectedSecret || providedSecret !== expectedSecret) {
    console.error("[process-image-job-background] Requête refusée : secret absent ou incorrect."); // jamais la valeur elle-même
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: "Non autorisé" }) };
  }

  let jobId;
  try {
    const payload = JSON.parse(event.body || "{}");
    jobId = payload.jobId;
  } catch (e) {
    return { statusCode: 400, body: "Corps de requête invalide" };
  }
  if (!jobId) return { statusCode: 400, body: "jobId manquant" };

  // À partir d'ici : plus aucune exception ne doit sortir non interceptée de cette fonction.
  try {
    const store = openJobStore();

    // --- Idempotence : ne jamais rappeler OpenAI pour un job déjà traité ou en cours récent ---
    let job;
    try {
      const raw = await store.get(`jobs/${jobId}`);
      job = raw ? JSON.parse(raw) : null;
    } catch (readErr) {
      console.error(`[process-image-job-background] Échec de lecture du job ${jobId} : ${String(readErr.message || readErr)}`);
      job = null;
    }
    if (!job) {
      console.error(`[process-image-job-background] Job ${jobId} introuvable — abandon sans appel OpenAI.`);
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Job introuvable" }) };
    }
    if (job.status === "completed" || job.status === "failed") {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: job.status }) };
    }
    if (job.status === "processing" && (Date.now() - (job.updatedAt || 0)) < PROCESSING_RECENT_THRESHOLD_MS) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: "already-processing" }) };
    }

    await safeSetJobStatus(store, jobId, { status: "processing", error: null });

    // --- Lecture de l'entrée complète (prompt + références) depuis Blobs, jamais depuis le corps ---
    let input;
    try {
      const inputRaw = await store.get(`jobs/${jobId}/input`);
      input = inputRaw ? JSON.parse(inputRaw) : null;
    } catch (inputErr) {
      input = null;
    }
    if (!input) {
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: "Entrée du job introuvable en Blobs.", source: "storage" } });
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Entrée introuvable" }) };
    }
    const { prompt, size, model, quality, requestedQuality, effectiveQuality, requestedSize, effectiveSize, referenceImageUrls, referenceImageData, referenceRoles, brandComposition, v3Plan, costMode } = input;
    const referenceRequired = input.referenceRequired === true;

    if(costMode==="test"&&(quality==="high"||effectiveQuality==="high")){
      const costAudit=buildCostAudit({mode:"test",referenceImageCount:0,visionUsage:false,imageCalls:0,requestedQuality,requestedSize,effectiveSize});
      await safeSetJobStatus(store,jobId,{status:"failed",error:{message:"Incohérence de coût : Mode Test demandé, qualité haute détectée",source:"cost-control"},costAudit,imageGenerationCallCount:0});
      return {statusCode:200,body:JSON.stringify({ok:false,error:"Incohérence de coût : Mode Test demandé, qualité haute détectée",imageGenerationCallCount:0})};
    }
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: "Variable d'environnement OPENAI_API_KEY manquante sur Netlify", source: "config" } });
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Configuration manquante" }) };
    }

    let data;
    let usedReference = false;
    let referenceFallbackReason = null;
    let providerSafetyFallbackUsed = false;
    const hasUrls = Array.isArray(referenceImageUrls) && referenceImageUrls.length;
    const hasData = Array.isArray(referenceImageData) && referenceImageData.length;
    try {
      if (hasUrls || hasData) {
        try {
          data = await generateWithReferenceImages({ key, prompt, size, model, quality, referenceImageUrls, referenceImageData });
          usedReference = true;
        } catch (refErr) {
          referenceFallbackReason = String(refErr.message || refErr);
          if(referenceRequired||v3Plan){
            throw new Error(`Référence obligatoire non utilisée : ${referenceFallbackReason}`);
          }
          // Dégradation propre pour les références artistiques facultatives uniquement.
          data = await generateStandard({ key, prompt, size, model, quality });
          usedReference = false;
        }
      } else {
        data = await generateStandard({ key, prompt, size, model, quality });
      }
    } catch (genErr) {
      const canFallback=!hasUrls&&!hasData&&v3Plan&&bodyworkSafetyFallbackEligible(v3Plan)&&isProviderSafetyRejection(genErr);
      if(canFallback){
        const safePrompt=buildProviderSafeBodyworkPrompt(v3Plan);
        try{
          data=await generateStandard({key,prompt:safePrompt,size,model,quality});
          providerSafetyFallbackUsed=true;
          referenceFallbackReason="provider-safety-fallback-after-rejected-primary-prompt";
        }catch(fallbackErr){
          await safeSetJobStatus(store,jobId,{status:"failed",error:{message:String(fallbackErr.message||fallbackErr),source:"openai-safety-fallback"},usedReference:false,referenceFallbackReason:"provider-safety-fallback-rejected",providerSafetyFallbackUsed:true});
          return {statusCode:200,body:JSON.stringify({ok:false,error:String(fallbackErr.message||fallbackErr)})};
        }
      }else{
        await safeSetJobStatus(store, jobId, { status: "failed", error: { message: String(genErr.message || genErr), source: "openai" }, usedReference: false, referenceFallbackReason, providerSafetyFallbackUsed:false });
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(genErr.message || genErr) }) };
      }
    }

    let b64 = data.data?.[0]?.b64_json || null;
    let url = data.data?.[0]?.url || null;
    if (!b64 && !url) {
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: "Aucune image reçue du fournisseur.", source: "openai" }, usedReference, referenceFallbackReason });
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Aucune image reçue du fournisseur." }) };
    }

    // V3 conserve toujours la photographie éditoriale brute, y compris lorsqu'une composition ou
    // un contrôle aval la refuse. Elle reste distincte de l'affiche finale et du texte du post.
    const rawResultKey = `jobs/${jobId}/raw-result`;
    try { await store.set(rawResultKey, JSON.stringify({ b64, url, preserved:true })); }
    catch(rawWriteErr){
      await safeSetJobStatus(store, jobId, { status:"failed", error:{ message:`Conservation de la photographie brute impossible : ${String(rawWriteErr.message||rawWriteErr)}`, source:"storage" } });
      return { statusCode:200, body:JSON.stringify({ok:false,error:"Conservation de la photographie brute impossible"}) };
    }

    let brandComposited = false;
    let v3Finalization = null;
    let rawImageBuffer = null;
    if(v3Plan){
      rawImageBuffer=await generatedImageToBuffer(b64,url);
      const executed=await executeV3Pipeline({plan:v3Plan,rawImageBuffer,preserveRaw:async()=>{},analyzeImage:(buffer,plan)=>analyzeImageWithOpenAI({key,imageBuffer:buffer,plan}),brandComposition,
        composeImage:async(buffer,selectedLayout,composition)=>{if(!composition||composition.enabled!==true)throw new Error("Composition de marque V3 absente.");const brandStore=openBrandStore();const rawLogoRecord=await brandStore.get("vf-logo-asset");if(!rawLogoRecord)throw new Error("Logo officiel absent de Netlify Blobs.");const logoRecord=JSON.parse(rawLogoRecord);return composeBrandPoster({imageBuffer:buffer,logoDataUrl:logoRecord.dataUrl,platform:String(composition.platform||"Instagram"),headline:String(composition.headline||""),zoneText:String(composition.zoneText||""),selectedLayout,posterStrategy:v3Plan.posterStrategy});}});
      v3Finalization=executed.finalization;brandComposited=executed.brandComposited;b64=executed.imageBuffer.toString("base64");url=null;
    }
    if(!v3Plan && brandComposition && brandComposition.enabled === true){
      try{
        const brandStore = openBrandStore();
        const rawLogoRecord = await brandStore.get("vf-logo-asset");
        if(!rawLogoRecord) throw new Error("Logo officiel absent de Netlify Blobs.");
        const logoRecord = JSON.parse(rawLogoRecord);
        const imageBuffer = rawImageBuffer || await generatedImageToBuffer(b64, url);
        const finalBuffer = await composeBrandPoster({
          imageBuffer,
          logoDataUrl: logoRecord.dataUrl,
          platform: String(brandComposition.platform || "Instagram"),
          headline: String(brandComposition.headline || ""),
          zoneText: String(brandComposition.zoneText || ""),
          selectedLayout: v3Finalization&&v3Finalization.layout,
        });
        b64 = finalBuffer.toString("base64");
        url = null;
        brandComposited = true;
      }catch(compositionErr){
        if(v3Plan){
          v3Finalization.quality={...v3Finalization.quality,ok:false,technical:{ok:false,errors:[...v3Finalization.quality.technical.errors,"composition_sharp"]}};
          v3Finalization.error=`Composition de marque impossible : ${String(compositionErr.message||compositionErr)}`;
        }else{
          await safeSetJobStatus(store,jobId,{status:"failed",error:{message:`Composition de marque impossible : ${String(compositionErr.message||compositionErr)}`,source:"brand-compositor"},usedReference,referenceFallbackReason,rawResultKey});
          return {statusCode:200,body:JSON.stringify({ok:false,error:"Composition de marque impossible"})};
        }
      }
    }

    const resultKey = `jobs/${jobId}/result`;
    try {
      await store.set(resultKey, JSON.stringify({ b64, url, usedReference, brandComposited, v3Finalization, providerSafetyFallbackUsed }));
    } catch (resultWriteErr) {
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: `Échec d'écriture du résultat : ${String(resultWriteErr.message || resultWriteErr)}`, source: "storage" }, usedReference, referenceFallbackReason });
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Échec d'écriture du résultat" }) };
    }

    // usage réel OpenAI Images (tokens texte/image) : persisté dans le STATUT (léger — jamais le b64)
    // pour l'archivage des coûts mesurés côté client. Additif, rétrocompatible.
    const usage = data.usage ? { input_tokens: data.usage.input_tokens ?? null, output_tokens: data.usage.output_tokens ?? null, input_tokens_details: data.usage.input_tokens_details ?? null } : null;
    const referenceImageCount=(referenceImageUrls||[]).length+(referenceImageData||[]).length;
    const costAudit=buildCostAudit({mode:costMode||"test",referenceImageCount,referenceRoles,imageUsage:usage,visionUsage:v3Plan?{}:false,retries:providerSafetyFallbackUsed?1:0,imageCalls:1,requestedQuality,requestedSize,effectiveSize});
    const referenceAudit={referenceImageCount,used:usedReference,reason:v3Plan?.psioRequired?"Étape PSiO® contractuelle":"Référence visuelle explicitement sélectionnée",stage:v3Plan?.contract.requiredCompositeStages?.find(x=>/PSiO/i.test(x))||null,roles:referenceRoles||[],estimatedInputImageCostEur:null,costDetermination:"unknown_until_billing",costIncludedInOutputEstimate:false,usage:data.usage?.input_tokens_details||null};
    const artFingerprint=v3Plan&&v3Finalization?artisticFingerprint(v3Plan,v3Finalization,v3Finalization.quality.ok?"validated":"refused"):null;
    await safeSetJobStatus(store, jobId, { status: "completed", error: null, resultKey, rawResultKey, usedReference, referenceFallbackReason, providerSafetyFallbackUsed, brandComposited, v3Plan, v3Finalization,artFingerprint,referenceAudit,costAudit,requestedQuality,effectiveQuality:quality,requestedSize,effectiveSize:size,imageGenerationCallCount:1,usage });

    // Nettoyage de l'entrée après usage réussi — best-effort, non bloquant si ça échoue.
    try { await store.delete(`jobs/${jobId}/input`); } catch (deleteErr) { /* pas grave, l'entrée reste simplement, sans impact fonctionnel */ }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    // Filet de sécurité ultime : même une erreur totalement imprévue ne doit jamais sortir non
    // interceptée. On journalise uniquement un message, jamais de secret ni de base64.
    console.error(`[process-image-job-background] Erreur inattendue pour ${jobId} : ${String(err && err.message || err)}`);
    try {
      const store = openJobStore();
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: "Erreur interne inattendue.", source: "internal" } });
    } catch (finalErr) {
      console.error(`[process-image-job-background] Impossible de marquer le job ${jobId} en échec.`);
    }
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Erreur interne" }) };
  }
};
