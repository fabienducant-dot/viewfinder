/* Fonction serveur Viewfinder — génération d'image (OpenAI en premier fournisseur).
   Variable d'environnement requise sur Netlify : OPENAI_API_KEY */

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
  const { prompt, size, model } = payload;

  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Variable d'environnement OPENAI_API_KEY manquante sur Netlify");

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
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json || null;
    const url = data.data?.[0]?.url || null;

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ b64, url }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
