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

const PROCESSING_RECENT_THRESHOLD_MS = 14 * 60 * 1000; // en dessous, on suppose qu'une autre
                                                          // invocation traite déjà ce job

function openJobStore(){
  const opts = { consistency: "strong" };
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-image-jobs", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN, ...opts });
  }
  return getStore({ name: "viewfinder-image-jobs", ...opts });
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

async function generateWithReferenceImages({ key, prompt, size, model, referenceImageUrls, referenceImageData }){
  const form = new FormData();
  form.append("model", model || "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", size || "1024x1024");
  form.append("n", "1");
  // input_fidelity "high" : paramètre documenté par OpenAI pour préserver les détails distinctifs
  // des images de référence (logos, visages) avec gpt-image-1 sur /v1/images/edits — indispensable
  // au prototype logo-référence : sans lui, le logo officiel risque d'être approximé.
  form.append("input_fidelity", "high");
  const urls = (referenceImageUrls || []).slice(0, 3);
  const dataUrls = (referenceImageData || []).slice(0, 3 - urls.length);
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

async function generateStandard({ key, prompt, size, model }){
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model || "gpt-image-1",
      prompt,
      size: size || "1024x1024",
      n: 1,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Images a répondu ${res.status} : ${errText.slice(0, 300)}`);
  }
  return res.json();
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
    const { prompt, size, model, referenceImageUrls, referenceImageData } = input;

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: "Variable d'environnement OPENAI_API_KEY manquante sur Netlify", source: "config" } });
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Configuration manquante" }) };
    }

    let data;
    let usedReference = false;
    let referenceFallbackReason = null;
    const hasUrls = Array.isArray(referenceImageUrls) && referenceImageUrls.length;
    const hasData = Array.isArray(referenceImageData) && referenceImageData.length;
    try {
      if (hasUrls || hasData) {
        try {
          data = await generateWithReferenceImages({ key, prompt, size, model, referenceImageUrls, referenceImageData });
          usedReference = true;
        } catch (refErr) {
          // dégradation propre : on retombe sur la génération standard, mais on garde la raison
          // exacte pour que le client sache que l'image B n'est pas valide pour un comparatif A/B
          referenceFallbackReason = String(refErr.message || refErr);
          data = await generateStandard({ key, prompt, size, model });
          usedReference = false;
        }
      } else {
        data = await generateStandard({ key, prompt, size, model });
      }
    } catch (genErr) {
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: String(genErr.message || genErr), source: "openai" }, usedReference: false, referenceFallbackReason });
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(genErr.message || genErr) }) };
    }

    const b64 = data.data?.[0]?.b64_json || null;
    const url = data.data?.[0]?.url || null;
    if (!b64 && !url) {
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: "Aucune image reçue du fournisseur.", source: "openai" }, usedReference, referenceFallbackReason });
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Aucune image reçue du fournisseur." }) };
    }

    const resultKey = `jobs/${jobId}/result`;
    try {
      await store.set(resultKey, JSON.stringify({ b64, url, usedReference }));
    } catch (resultWriteErr) {
      await safeSetJobStatus(store, jobId, { status: "failed", error: { message: `Échec d'écriture du résultat : ${String(resultWriteErr.message || resultWriteErr)}`, source: "storage" }, usedReference, referenceFallbackReason });
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Échec d'écriture du résultat" }) };
    }

    // usage réel OpenAI Images (tokens texte/image) : persisté dans le STATUT (léger — jamais le b64)
    // pour l'archivage des coûts mesurés côté client. Additif, rétrocompatible.
    const usage = data.usage ? { input_tokens: data.usage.input_tokens ?? null, output_tokens: data.usage.output_tokens ?? null, input_tokens_details: data.usage.input_tokens_details ?? null } : null;
    await safeSetJobStatus(store, jobId, { status: "completed", error: null, resultKey, usedReference, referenceFallbackReason, usage });

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
