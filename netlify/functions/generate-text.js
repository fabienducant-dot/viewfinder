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
  const { kind, model, baseUrl, systemPrompt, userPrompt, responseSchema, imageDataUrl, reasoning_effort } = payload;
    let usage = null; // renseigné uniquement par les providers qui exposent les tokens (OpenAI-compatible)

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
      // Message multimodal si une image est fournie (Image Result Analyzer) ; texte seul sinon —
      // comportement historique inchangé pour tous les appels qui ne fournissent pas imageDataUrl.
      const userContent = imageDataUrl
        ? [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ]
        : userPrompt;
      const body = {
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      };
      // Structured Outputs : seulement si un schéma JSON strict est explicitement fourni — n'affecte
      // aucun appel existant qui ne le transmet pas (Creative Planner, Image Result Analyzer, texte
      // depuis le brief en fournissent un ; les anciens appels texte n'en fournissent pas).
      // reasoning_effort (ex. "minimal" pour le Rédacteur DA) : transmis uniquement s'il est fourni —
      // aucun appel existant n'en envoie, comportement historique strictement inchangé.
      if (typeof reasoning_effort === "string" && reasoning_effort) body.reasoning_effort = reasoning_effort;
      const hasResponseSchema = !!(responseSchema && typeof responseSchema === "object");
      if (hasResponseSchema) {
        body.response_format = { type: "json_schema", json_schema: responseSchema };
      }
      // --- DIAGNOSTIC TEMPORAIRE (uniquement si responseSchema est fourni) ---
      // Vérifie la requête RÉELLEMENT exécutée, pas seulement reconstruite depuis le code.
      // Ne journalise jamais la clé API ni les prompts complets.
      if (hasResponseSchema) {
        console.log("[DIAG generate-text] kind reçu :", kind);
        console.log("[DIAG generate-text] model reçu :", model);
        console.log("[DIAG generate-text] baseUrl reçu :", baseUrl);
        console.log("[DIAG generate-text] URL finale appelée :", url);
        console.log("[DIAG generate-text] response_format présent :", !!body.response_format);
        console.log("[DIAG generate-text] response_format.type :", body.response_format && body.response_format.type);
        console.log("[DIAG generate-text] response_format.json_schema.name :", body.response_format && body.response_format.json_schema && body.response_format.json_schema.name);
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (hasResponseSchema) {
        console.log("[DIAG generate-text] statut HTTP retourné par OpenAI :", res.status);
      }
      if (!res.ok) throw new Error(`Le fournisseur a répondu ${res.status} : ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      if (hasResponseSchema) {
        const choice = data.choices?.[0];
        console.log("[DIAG generate-text] finish_reason :", choice?.finish_reason);
        console.log("[DIAG generate-text] présence de message.refusal :", !!(choice?.message?.refusal));
        console.log("[DIAG generate-text] 300 premiers caractères de message.content :", String(choice?.message?.content || "").slice(0, 300));
      }
      text = data.choices?.[0]?.message?.content || "";
      // usage réel OpenAI (tokens) : transmis tel quel au client pour l'archivage des coûts mesurés.
      // Additif et rétrocompatible : les consommateurs existants ne lisent que { text }.
      if (data.usage) usage = { prompt_tokens: data.usage.prompt_tokens ?? null, completion_tokens: data.usage.completion_tokens ?? null };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, usage }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
