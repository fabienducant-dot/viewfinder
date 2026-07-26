/* Fonction serveur SDZ App — récupération STREAMÉE de l'image finale.
   Le PNG peut dépasser la limite d'une réponse Functions mise en mémoire tampon. Un
   ReadableStream permet à Netlify de livrer jusqu'à 20 Mo sans couper la connexion,
   tout en conservant le résultat OpenAI existant dans Blobs : aucune régénération. */
import { getStore } from "@netlify/blobs";

function openJobStore(){
  const opts = { consistency: "strong" };
  const siteID = Netlify.env.get("BLOBS_SITE_ID");
  const token = Netlify.env.get("BLOBS_TOKEN");
  if(siteID && token){
    return getStore({ name: "viewfinder-image-jobs", siteID, token, ...opts });
  }
  return getStore({ name: "viewfinder-image-jobs", ...opts });
}

function jsonResponse(payload, status){
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function streamBuffer(buffer){
  const chunkSize = 64 * 1024;
  let offset = 0;
  return new ReadableStream({
    pull(controller){
      if(offset >= buffer.length){
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, buffer.length);
      controller.enqueue(new Uint8Array(buffer.subarray(offset, end)));
      offset = end;
    },
  });
}

export default async (request) => {
  if(request.method !== "GET"){
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  if(!jobId){
    return jsonResponse({ error: "jobId manquant" }, 400);
  }

  try{
    const store = openJobStore();
    const jobRaw = await store.get(`jobs/${jobId}`);
    if(!jobRaw){
      return jsonResponse({ error: "Travail introuvable" }, 404);
    }

    const job = JSON.parse(jobRaw);
    if(job.status !== "completed" || !job.resultKey){
      return jsonResponse({ error: `Travail pas encore terminé (statut actuel : ${job.status})` }, 409);
    }

    const resultRaw = await store.get(job.resultKey);
    if(!resultRaw){
      return jsonResponse({ error: "Résultat introuvable malgré un statut terminé." }, 404);
    }
    const result = JSON.parse(resultRaw);

    if(result.b64){
      const imageBuffer = Buffer.from(result.b64, "base64");
      return new Response(streamBuffer(imageBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(imageBuffer.length),
          "Cache-Control": "private, no-store",
          "Content-Disposition": `inline; filename="viewfinder-${jobId}.png"`,
        },
      });
    }
    if(result.url){
      return Response.redirect(result.url, 302);
    }
    return jsonResponse({ error: "Aucune image disponible pour ce travail." }, 404);
  }catch(err){
    return jsonResponse({ error: String(err && err.message || err) }, 500);
  }
};
