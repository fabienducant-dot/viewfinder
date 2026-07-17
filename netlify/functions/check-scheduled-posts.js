/* Fonction planifiée Viewfinder — tourne automatiquement toutes les 15 minutes (voir config
   ci-dessous), indépendamment de tout appareil ou navigateur ouvert.

   Rôle : lire la liste des posts programmés dans Netlify Blobs, repérer ceux dont l'heure est
   passée, appeler UNE SEULE FOIS le webhook Make pour chacun (exactement comme un run manuel),
   puis marquer le post "envoyé" pour ne plus jamais le redéclencher.

   Sécurité : ne modifie jamais le texte ni l'image du post — se contente de les transmettre
   tels que validés dans l'appli. */
const { getStore } = require("@netlify/blobs");

function openStore(){
  if(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN){
    return getStore({ name: "viewfinder-data", siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });
  }
  return getStore("viewfinder-data");
}

/* Le texte collé pour Instagram suit la structure interne "1) Légende / 2) Hashtags / 3) Alt text"
   (voir TEXT_STRUCTURE côté client) — ces numéros ne doivent jamais être publiés tels quels sur
   Instagram. On les sépare ici en 3 champs distincts. Tolère 1) / 1. / 1: / 1- comme marqueur.
   Si le texte ne suit pas ce format (moins de 2 marqueurs trouvés), on le renvoie tel quel comme
   légende, sans rien inventer. */
/* Sécurité supplémentaire : quel que soit ce que le modèle a réellement renvoyé (TEXT_STRUCTURE
   demande 5 hashtags, mais rien ne garantit que la réponse les respecte), on ne laisse jamais
   passer plus de 5 hashtags uniques vers Make. Ne touche qu'au champ hashtags — jamais la légende
   ni l'alt text. Si aucun hashtag n'est détecté dans ce champ, il est renvoyé tel quel (repli). */
function limitHashtags(hashtagsRaw){
  if(typeof hashtagsRaw !== "string" || !hashtagsRaw.trim()) return hashtagsRaw;
  const found = hashtagsRaw.match(/#\S+/g);
  if(!found || !found.length) return hashtagsRaw; // aucun hashtag détecté : comportement actuel conservé
  const seen = new Set();
  const unique = [];
  for(const tag of found){
    const key = tag.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    unique.push(tag);
    if(unique.length >= 5) break;
  }
  return unique.join(" ");
}
function parseInstagramText(raw){
  if(typeof raw !== "string" || !raw.trim()) return { caption: raw || "", hashtags: "", altText: "" };
  const text = raw.trim();
  const markerRegex = /(?:^|\n)\s*([123])[.):\-]\s*/g;
  const matches = [...text.matchAll(markerRegex)];
  if(matches.length < 2) return { caption: text, hashtags: "", altText: "" };
  const parts = {};
  for(let i=0; i<matches.length; i++){
    const start = matches[i].index + matches[i][0].length;
    const end = i+1 < matches.length ? matches[i+1].index : text.length;
    parts[matches[i][1]] = text.slice(start, end).trim();
  }
  return {
    caption: (parts["1"]||"").trim(),
    hashtags: limitHashtags((parts["2"]||"").trim()),
    altText: (parts["3"]||"").trim(),
  };
}

exports.handler = async () => {
  try {
    const store = openStore();

    const webhookRaw = await store.get("vf-make-webhook");
    const webhookUrl = webhookRaw ? JSON.parse(webhookRaw) : "";
    if (!webhookUrl) {
      console.log("[check-scheduled-posts] Aucun webhook Make configuré — arrêt.");
      return { statusCode: 200, body: JSON.stringify({ skipped: "Aucun webhook Make configuré" }) };
    }
    console.log(`[check-scheduled-posts] Webhook configuré : ${webhookUrl}`);

    const scheduledRaw = await store.get("vf-scheduled");
    const scheduled = scheduledRaw ? JSON.parse(scheduledRaw) : [];
    console.log(`[check-scheduled-posts] ${scheduled.length} publication(s) au total dans le store.`);
    if (!Array.isArray(scheduled) || !scheduled.length) {
      return { statusCode: 200, body: JSON.stringify({ skipped: "Aucun post en attente" }) };
    }

    const now = Date.now();
    let sentCount = 0;
    let errorCount = 0;
    const dueCount = scheduled.filter(p => p.status === "programmé" && p.scheduledAt && p.scheduledAt <= now).length;
    console.log(`[check-scheduled-posts] ${dueCount} publication(s) éligible(s) (statut "programmé" + heure passée).`);

    for (const post of scheduled) {
      if (post.status !== "programmé") continue;
      if (!post.scheduledAt || post.scheduledAt > now) continue;

      console.log(`[check-scheduled-posts] Traitement du post ${post.id} (${post.platform}, prévu ${new Date(post.scheduledAt).toISOString()})`);

      try {
        const siteUrl = process.env.SITE_URL || process.env.URL || "";
        const imageUrl = post.imageDataUrl && siteUrl
          ? `${siteUrl.replace(/\/$/, "")}/img/${post.id}.jpg`
          : null;
        // Instagram uniquement : sépare la structure interne "1)/2)/3)" pour ne jamais publier ces
        // numéros — Make ne reçoit que la légende + les hashtags dans "texte", l'alt text à part.
        let texteEnvoye = post.textFinal;
        let altTextEnvoye;
        if(post.platform === "Instagram" && post.textFinal){
          const parsed = parseInstagramText(post.textFinal);
          texteEnvoye = [parsed.caption, parsed.hashtags].filter(Boolean).join("\n\n");
          altTextEnvoye = parsed.altText || undefined;
        }
        console.log(`[check-scheduled-posts] Post ${post.id} → appel du webhook Make : ${webhookUrl}`);
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plateforme: post.platform,
            mission: post.mission || null,
            sujet: post.topic,
            texte: texteEnvoye,
            alt_text: altTextEnvoye,
            image: post.imageDataUrl || null,
            image_url: imageUrl,
            type_contenu: post.platform,
          }),
        });
        console.log(`[check-scheduled-posts] Post ${post.id} → Make a répondu HTTP ${res.status}`);
        if (!res.ok) throw new Error(`Make a répondu ${res.status}`);
        post.status = "envoyé";
        post.sentAt = Date.now();
        post.error = null;
        sentCount++;
        console.log(`[check-scheduled-posts] Post ${post.id} → statut mis à jour : envoyé.`);
      } catch (err) {
        post.status = "erreur";
        post.error = String(err.message || err);
        errorCount++;
        console.log(`[check-scheduled-posts] Post ${post.id} → ERREUR : ${post.error}`);
      }
    }

    if (sentCount || errorCount) {
      await store.set("vf-scheduled", JSON.stringify(scheduled));
      console.log(`[check-scheduled-posts] Store mis à jour (${sentCount} envoyé(s), ${errorCount} erreur(s)).`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ checked: scheduled.length, due: dueCount, sent: sentCount, errors: errorCount }),
    };
  } catch (err) {
    console.log(`[check-scheduled-posts] ERREUR GLOBALE : ${String(err.message || err)}`);
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};

/* Toutes les 15 minutes — écriture dans netlify.toml plutôt qu'inline pour rester lisible. */
