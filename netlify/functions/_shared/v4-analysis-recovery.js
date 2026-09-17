"use strict";
const {executeV3Pipeline}=require("./v3-executor");
const {buildCostAudit}=require("./v3-cost-control");
const parse=value=>typeof value==="string"?JSON.parse(value):value;
async function prepareAnalysisRecovery(store,payload){
 if(payload.analysisConfirmed!==true||!payload.clientRequestId)throw new Error("Confirmation explicite de l'analyse et identifiant de reprise requis.");
 const source= parse(await store.get(`jobs/${payload.recoverAnalysisFor}`));
 if(!source||!source.rawResultKey||!source.v3Plan)throw new Error("Photographie brute ou plan original indisponible.");
 if(source.status!=="failed")throw new Error("La reprise d'analyse est réservée aux travaux échoués.");
 if(source.v3Finalization?.analysis)throw new Error("Analyse déjà disponible : utilisez la recomposition gratuite.");
 return {analysisOnly:true,sourceJobId:source.jobId,rawResultKey:source.rawResultKey,v3Plan:source.v3Plan,
  clientRequestId:`analysis-recovery:${source.jobId}:${payload.clientRequestId}`,costMode:"test",
  costAudit:{...buildCostAudit({mode:"test",imageCalls:0,visionUsage:{}}),operation:"analysis-recovery"}};
}
async function runAnalysisRecovery({store,jobId,input,key,analyzeImage,composeImage}){
 const record=parse(await store.get(input.rawResultKey));
 if(!record?.b64&&!record?.url)throw new Error("Photographie brute indisponible ; aucune image régénérée.");
 let imageBuffer;
 if(record.b64)imageBuffer=Buffer.from(record.b64,"base64");
 else{const response=await fetch(record.url);if(!response.ok)throw new Error("Photographie brute distante inaccessible.");imageBuffer=Buffer.from(await response.arrayBuffer());}
 const plan=input.v3Plan;
 const executed=await executeV3Pipeline({plan,rawImageBuffer:imageBuffer,preserveRaw:async()=>{},
  analyzeImage:async buffer=>{
    const analysis=await analyzeImage({key,imageBuffer:buffer,plan});
    const source=parse(await store.get(`jobs/${input.sourceJobId}`));
    if(source)await store.set(`jobs/${input.sourceJobId}`,JSON.stringify({...source,v3Finalization:{analysis},updatedAt:Date.now()}));
    return analysis;
  },
  composeImage:async(buffer,layout)=>composeImage({imageBuffer:buffer,platform:plan.artDirection.platform,posterStrategy:plan.posterStrategy,selectedLayout:layout}),
  brandComposition:{enabled:true}});
 const finalization=executed.finalization;
 const source=parse(await store.get(`jobs/${input.sourceJobId}`));
 if(source)await store.set(`jobs/${input.sourceJobId}`,JSON.stringify({...source,v3Finalization:finalization,updatedAt:Date.now()}));
 const resultKey=`jobs/${jobId}/result`;
 await store.set(resultKey,JSON.stringify({b64:executed.imageBuffer.toString("base64"),brandComposited:true,finalCompositionEngine:"sharp-server",v3Finalization:finalization}));
 const current=parse(await store.get(`jobs/${jobId}`));
 await store.set(`jobs/${jobId}`,JSON.stringify({...current,status:"completed",updatedAt:Date.now(),resultKey,rawResultKey:input.rawResultKey,v3Plan:plan,v3Finalization:finalization,brandComposited:true,finalCompositionEngine:"sharp-server",recomposedFrom:input.sourceJobId,costAudit:input.costAudit,imageGenerationCallCount:0}));
 return {statusCode:200,body:JSON.stringify({ok:true,imageGenerationCallCount:0})};
}
module.exports={prepareAnalysisRecovery,runAnalysisRecovery};
