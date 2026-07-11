/* Fonction serveur SDZ App — génération d'image (OpenAI en premier fournisseur).
   Même principe que generate-text.js : le navigateur n'appelle jamais OpenAI directement.
   Variable d'environnement requise sur Netlify : OPENAI_API_KEY

   Pour ajouter un futur fournisseur image (Stability, Ideogram, Flux, Fal...), ajouter une
   branche supplémentaire ici selon "kind", sur le même modèle — aucune autre modification
   n'est nécessaire côté application cliente.

   Référence de marque : si "referenceImageUrls" est fourni (ex : l'URL publique du vrai logo
   SDZ, /logo.png), on tente d'abord l'endpoint /v1/images/edits d'OpenAI, qui accepte une ou
   plusieurs images d'entrée en plus du prompt — cela permet au modèle de "voir" le vrai logo
   (proportions, or officiel) sans jamais le redessiner lui-même, la signature finale exacte
   restant de toute façon appliquée ensuite par SDZ App via Canvas. Si cet appel échoue pour
   n'importe quelle raison (fournisseur non compatible, erreur réseau, format...), on retombe
   automatiquement et silencieusement sur la génération texte seule habituelle : aucune requête
   de Fabien ne doit jamais échouer à cause de cette fonctionnalité optionnelle. */

async function fetchAsBlob(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Impossible de récupérer l'image de référence (${res.status})`);
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/png";
  return new Blob([buf], { type: contentType });
}

async function generateWithReferenceImages({ key, prompt, size, model, referenceImageUrls }){
  const form = new FormData();
  form.append("model", model || "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", size || "1024x1024");
  form.append("n", "1");
  for(const url of referenceImageUrls.slice(0, 3)){ // 3 images de référence maximum, largement suffisant
    const blob = await fetchAsBlob(url);
    form.append("image[]", blob, "reference.png");
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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Corps de requête invalide" }) };
  }
  const { prompt, size, model, referenceImageUrls } = payload;

  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Variable d'environnement OPENAI_API_KEY manquante sur Netlify");

    let data;
    let usedReference = false;
    if (Array.isArray(referenceImageUrls) && referenceImageUrls.length) {
      try {
        data = await generateWithReferenceImages({ key, prompt, size, model, referenceImageUrls });
        usedReference = true;
      } catch (refErr) {
        // dégradation propre : on retombe sur la génération standard, jamais d'échec côté utilisateur
        data = await generateStandard({ key, prompt, size, model });
      }
    } else {
      data = await generateStandard({ key, prompt, size, model });
    }

    const b64 = data.data?.[0]?.b64_json || null;
    const url = data.data?.[0]?.url || null;

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ b64, url, usedReference }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
