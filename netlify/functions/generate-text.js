/* Fonction serveur Viewfinder — génération de texte.
   Le navigateur n'appelle jamais directement OpenAI/Anthropic/Gemini (bloqué par CORS) :
   il appelle CETTE fonction, hébergée sur le même site Netlify, qui elle-même contacte
   le fournisseur choisi. La clé API ne quitte jamais le serveur — elle vit uniquement
   dans les variables d'environnement Netlify (Site configuration > Environment variables) :
     OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY */

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
  const { kind, model, baseUrl, systemPrompt, userPrompt } = payload;

  try {
    let text;

    if (kind === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("Variable d'environnement ANTHROPIC_API_KEY manquante sur Netlify");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-4-6",
          max_tokens: 1200,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic a répondu ${res.status} : ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      text = (data.content || []).map((b) => b.text || "").join("\n");

    } else if (kind === "google-gemini") {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("Variable d'environnement GEMINI_API_KEY manquante sur Netlify");
      const m = model || "gemini-1.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }] }),
        }
      );
      if (!res.ok) throw new Error(`Gemini a répondu ${res.status} : ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");

    } else {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("Variable d'environnement OPENAI_API_KEY manquante sur Netlify");
      const url = `${(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Le fournisseur a répondu ${res.status} : ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      text = data.choices?.[0]?.message?.content || "";
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
