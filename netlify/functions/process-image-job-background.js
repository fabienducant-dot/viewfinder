/* Background Function Netlify — exécute un et un seul appel OpenAI Images par job.
   La scène est générée par le fournisseur, puis contrôlée par SceneIntent et composée avec
   l'actif SDZ statique embarqué dans le bundle. Aucun fallback image caché n'est autorisé. */
const {getStore}=require("@netlify/blobs");
const {applyImageEditOptions}=require("./_shared/openai-image-edit-options");
const {composeBrandPoster}=require("./_shared/brand-compositor");
const {analyzeImageWithOpenAI}=require("./_shared/v3-image-analyzer");
const {executeV3Pipeline}=require("./_shared/v3-executor");
const {buildCostAudit}=require("./_shared/v3-cost-control");
const {artisticFingerprint}=require("./_shared/v3-pipeline");

const PROCESSING_RECENT_THRESHOLD_MS=14*60*1000;

function openJobStore(){
  const opts={consistency:"strong"};
  if(process.env.BLOBS_SITE_ID&&process.env.BLOBS_TOKEN)return getStore({name:"viewfinder-image-jobs",siteID:process.env.BLOBS_SITE_ID,token:process.env.BLOBS_TOKEN,...opts});
  return getStore({name:"viewfinder-image-jobs",...opts});
}

async function generatedImageToBuffer(b64,url){
  if(b64)return Buffer.from(b64,"base64");
  if(!url)throw new Error("Aucune image reçue du fournisseur.");
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Téléchargement de l'image OpenAI impossible (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function safeSetJobStatus(store,jobId,patch){
  try{
    const raw=await store.get(`jobs/${jobId}`);
    const current=raw?JSON.parse(raw):{jobId,createdAt:Date.now()};
    const next={...current,...patch,jobId,updatedAt:Date.now()};
    await store.set(`jobs/${jobId}`,JSON.stringify(next));
    return next;
  }catch(writeErr){
    console.error(`[process-image-job-background] Échec d'écriture du statut pour ${jobId} : ${String(writeErr.message||writeErr)}`);
    return null;
  }
}

async function fetchAsBlob(url){
  const res=await fetch(url);
  if(!res.ok)throw new Error(`Impossible de récupérer l'image de référence (${res.status})`);
  const buf=await res.arrayBuffer();
  return new Blob([buf],{type:res.headers.get("content-type")||"image/png"});
}

function dataUrlToBlob(dataUrl){
  const match=String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if(!match)throw new Error("Image de référence en base64 invalide");
  return new Blob([Buffer.from(match[2],"base64")],{type:match[1]});
}

async function generateWithReferenceImages({key,prompt,size,model,quality,referenceImageUrls,referenceImageData}){
  const form=new FormData();
  form.append("prompt",prompt);form.append("size",size||"1024x1024");form.append("n","1");
  applyImageEditOptions(form,{model,quality});
  const urls=(referenceImageUrls||[]).slice(0,4),dataUrls=(referenceImageData||[]).slice(0,4-urls.length);
  for(const url of urls)form.append("image[]",await fetchAsBlob(url),"reference.png");
  for(const dataUrl of dataUrls)form.append("image[]",dataUrlToBlob(dataUrl),"campaign-reference.png");
  const res=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{Authorization:`Bearer ${key}`},body:form});
  if(!res.ok)throw new Error(`OpenAI Images (edits) a répondu ${res.status} : ${(await res.text()).slice(0,300)}`);
  return res.json();
}

async function generateStandard({key,prompt,size,model,quality}){
  const res=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:model||"gpt-image-2",prompt,size:size||"1024x1024",...(quality?{quality}:{}),n:1})});
  if(!res.ok)throw new Error(`OpenAI Images a répondu ${res.status} : ${(await res.text()).slice(0,300)}`);
  return res.json();
}

exports.handler=async event=>{
  const providedSecret=(event.headers&&(event.headers["x-image-job-secret"]||event.headers["X-Image-Job-Secret"]))||"";
  const expectedSecret=process.env.IMAGE_JOB_SECRET;
  if(!expectedSecret||providedSecret!==expectedSecret){
    console.error("[process-image-job-background] Requête refusée : secret absent ou incorrect.");
    return {statusCode:401,body:JSON.stringify({ok:false,error:"Non autorisé"})};
  }

  let jobId;
  try{jobId=JSON.parse(event.body||"{}").jobId;}catch(error){return {statusCode:400,body:"Corps de requête invalide"};}
  if(!jobId)return {statusCode:400,body:"jobId manquant"};

  try{
    const store=openJobStore();
    let job;
    try{const raw=await store.get(`jobs/${jobId}`);job=raw?JSON.parse(raw):null;}catch(error){job=null;}
    if(!job)return {statusCode:200,body:JSON.stringify({ok:false,error:"Job introuvable"})};
    if(job.status==="completed"||job.status==="failed")return {statusCode:200,body:JSON.stringify({ok:true,skipped:job.status})};
    if(job.status==="processing"&&(Date.now()-(job.updatedAt||0))<PROCESSING_RECENT_THRESHOLD_MS)return {statusCode:200,body:JSON.stringify({ok:true,skipped:"already-processing"})};
    await safeSetJobStatus(store,jobId,{status:"processing",error:null});

    let input;
    try{const raw=await store.get(`jobs/${jobId}/input`);input=raw?JSON.parse(raw):null;}catch(error){input=null;}
    if(!input){
      await safeSetJobStatus(store,jobId,{status:"failed",error:{message:"Entrée du job introuvable en Blobs.",source:"storage"},imageGenerationCallCount:0});
      return {statusCode:200,body:JSON.stringify({ok:false,error:"Entrée introuvable",imageGenerationCallCount:0})};
    }

    const {prompt,size,model,quality,requestedQuality,effectiveQuality,requestedSize,effectiveSize,referenceImageUrls,referenceImageData,referenceRoles,brandComposition,v3Plan,costMode}=input;
    if(costMode==="test"&&(quality==="high"||effectiveQuality==="high")){
      const costAudit=buildCostAudit({mode:"test",referenceImageCount:0,visionUsage:false,imageCalls:0,requestedQuality,requestedSize,effectiveSize});
      await safeSetJobStatus(store,jobId,{status:"failed",error:{message:"Incohérence de coût : Mode Test demandé, qualité haute détectée",source:"cost-control"},costAudit,imageGenerationCallCount:0});
      return {statusCode:200,body:JSON.stringify({ok:false,error:"Incohérence de coût : Mode Test demandé, qualité haute détectée",imageGenerationCallCount:0})};
    }
    const key=process.env.OPENAI_API_KEY;
    if(!key){
      await safeSetJobStatus(store,jobId,{status:"failed",error:{message:"Variable d'environnement OPENAI_API_KEY manquante sur Netlify",source:"config"},imageGenerationCallCount:0});
      return {statusCode:200,body:JSON.stringify({ok:false,error:"Configuration manquante",imageGenerationCallCount:0})};
    }

    const hasUrls=Array.isArray(referenceImageUrls)&&referenceImageUrls.length>0,hasData=Array.isArray(referenceImageData)&&referenceImageData.length>0,usedReference=hasUrls||hasData;
    let data;
    try{
      /* Frontière de coût absolue : ce bloc contient l'unique appel Images du job. Si cet appel
         échoue, le job échoue. Aucun second prompt, aucune seconde génération, aucun retry applicatif. */
      data=usedReference
        ?await generateWithReferenceImages({key,prompt,size,model,quality,referenceImageUrls,referenceImageData})
        :await generateStandard({key,prompt,size,model,quality});
    }catch(genErr){
      await safeSetJobStatus(store,jobId,{status:"failed",error:{message:String(genErr.message||genErr),source:"openai"},usedReference,referenceFallbackReason:null,imageGenerationCallCount:1});
      return {statusCode:200,body:JSON.stringify({ok:false,error:String(genErr.message||genErr),imageGenerationCallCount:1})};
    }

    let b64=data.data?.[0]?.b64_json||null,url=data.data?.[0]?.url||null;
    if(!b64&&!url){
      await safeSetJobStatus(store,jobId,{status:"failed",error:{message:"Aucune image reçue du fournisseur.",source:"openai"},usedReference,imageGenerationCallCount:1});
      return {statusCode:200,body:JSON.stringify({ok:false,error:"Aucune image reçue du fournisseur.",imageGenerationCallCount:1})};
    }

    const rawResultKey=`jobs/${jobId}/raw-result`;
    try{await store.set(rawResultKey,JSON.stringify({b64,url,preserved:true}));}
    catch(rawWriteErr){
      await safeSetJobStatus(store,jobId,{status:"failed",error:{message:`Conservation de la photographie brute impossible : ${String(rawWriteErr.message||rawWriteErr)}`,source:"storage"},imageGenerationCallCount:1});
      return {statusCode:200,body:JSON.stringify({ok:false,error:"Conservation de la photographie brute impossible",imageGenerationCallCount:1})};
    }

    let brandComposited=false,v3Finalization=null,rawImageBuffer=null;
    if(v3Plan){
      rawImageBuffer=await generatedImageToBuffer(b64,url);
      const executed=await executeV3Pipeline({
        plan:v3Plan,rawImageBuffer,preserveRaw:async()=>{},
        analyzeImage:(buffer,plan)=>analyzeImageWithOpenAI({key,imageBuffer:buffer,plan}),
        brandComposition,
        composeImage:async(buffer,selectedLayout,composition)=>{
          if(!composition||composition.enabled!==true)throw new Error("Composition de marque V4 absente.");
          return composeBrandPoster({imageBuffer:buffer,platform:String(composition.platform||"Instagram"),headline:String(composition.headline||""),zoneText:String(composition.zoneText||""),selectedLayout,posterStrategy:v3Plan.posterStrategy});
        }
      });
      v3Finalization=executed.finalization;brandComposited=executed.brandComposited;b64=executed.imageBuffer.toString("base64");url=null;
    }else if(brandComposition&&brandComposition.enabled===true){
      try{
        const imageBuffer=rawImageBuffer||await generatedImageToBuffer(b64,url);
        const finalBuffer=await composeBrandPoster({imageBuffer,platform:String(brandComposition.platform||"Instagram"),headline:String(brandComposition.headline||""),zoneText:String(brandComposition.zoneText||"")});
        b64=finalBuffer.toString("base64");url=null;brandComposited=true;
      }catch(compositionErr){
        await safeSetJobStatus(store,jobId,{status:"failed",error:{message:`Composition de marque impossible : ${String(compositionErr.message||compositionErr)}`,source:"brand-compositor"},usedReference,rawResultKey,imageGenerationCallCount:1});
        return {statusCode:200,body:JSON.stringify({ok:false,error:"Composition de marque impossible",imageGenerationCallCount:1})};
      }
    }

    const resultKey=`jobs/${jobId}/result`;
    try{await store.set(resultKey,JSON.stringify({b64,url,usedReference,brandComposited,v3Finalization}));}
    catch(resultWriteErr){
      await safeSetJobStatus(store,jobId,{status:"failed",error:{message:`Échec d'écriture du résultat : ${String(resultWriteErr.message||resultWriteErr)}`,source:"storage"},usedReference,imageGenerationCallCount:1});
      return {statusCode:200,body:JSON.stringify({ok:false,error:"Échec d'écriture du résultat",imageGenerationCallCount:1})};
    }

    const usage=data.usage?{input_tokens:data.usage.input_tokens??null,output_tokens:data.usage.output_tokens??null,input_tokens_details:data.usage.input_tokens_details??null}:null;
    const referenceImageCount=(referenceImageUrls||[]).length+(referenceImageData||[]).length;
    const costAudit=buildCostAudit({mode:costMode||"test",referenceImageCount,referenceRoles,imageUsage:usage,visionUsage:v3Plan?{}:false,retries:0,imageCalls:1,requestedQuality,requestedSize,effectiveSize});
    const referenceAudit={referenceImageCount,used:usedReference,reason:v3Plan?.psioRequired?"Étape PSiO® contractuelle":"Référence visuelle explicitement sélectionnée",stage:v3Plan?.contract.requiredCompositeStages?.find(x=>/PSiO/i.test(x))||null,roles:referenceRoles||[],estimatedInputImageCostEur:null,costDetermination:"unknown_until_billing",costIncludedInOutputEstimate:false,usage:data.usage?.input_tokens_details||null};
    const artFingerprint=v3Plan&&v3Finalization?artisticFingerprint(v3Plan,v3Finalization,v3Finalization.quality.ok?"validated":"refused"):null;
    await safeSetJobStatus(store,jobId,{status:"completed",error:null,resultKey,rawResultKey,usedReference,referenceFallbackReason:null,brandComposited,v3Plan,v3Finalization,artFingerprint,referenceAudit,costAudit,requestedQuality,effectiveQuality:quality,requestedSize,effectiveSize:size,imageGenerationCallCount:1,usage});
    try{await store.delete(`jobs/${jobId}/input`);}catch(error){}
    return {statusCode:200,body:JSON.stringify({ok:true,imageGenerationCallCount:1})};
  }catch(err){
    console.error(`[process-image-job-background] Erreur inattendue pour ${jobId} : ${String(err&&err.message||err)}`);
    try{await safeSetJobStatus(openJobStore(),jobId,{status:"failed",error:{message:"Erreur interne inattendue.",source:"internal"}});}catch(error){}
    return {statusCode:200,body:JSON.stringify({ok:false,error:"Erreur interne"})};
  }
};

exports.generateStandard=generateStandard;
exports.generateWithReferenceImages=generateWithReferenceImages;
exports.generatedImageToBuffer=generatedImageToBuffer;
