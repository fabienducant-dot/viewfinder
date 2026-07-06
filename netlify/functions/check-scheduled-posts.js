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
        console.log(`[check-scheduled-posts] Post ${post.id} → appel du webhook Make : ${webhookUrl}`);
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plateforme: post.platform,
            mission: post.mission || null,
            sujet: post.topic,
            texte: post.textFinal,
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
