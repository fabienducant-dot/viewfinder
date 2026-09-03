"use strict";

const {getStore}=require("@netlify/blobs");
const crypto=require("crypto");
const fs=require("fs");
const {chooseLayout,analyzeActualImage,normalizePlatform}=require("./_shared/v3-layout-engine");
const {compatibilityMatrix,cropPosition}=require("./_shared/v3-campaign");
const {assessQuality}=require("./_shared/v3-quality");
const {buildCostAudit}=require("./_shared/v3-cost-control");

const RECOMPOSE_VERSION="3.0.0-static-brand-asset";
const EXPECTED_FONTS=Object.freeze(["Cormorant Garamond 600","Manrope 500","Manrope 600"]);
let runtimeCache=null;

function loadCompositorRuntime(){
  if(runtimeCache)return runtimeCache;
  const sharp=require("sharp"),opentype=require("opentype.js"),compositor=require("./_shared/brand-compositor");
  const paths=Object.values(compositor.FONT_PATHS||{});
  if(paths.length!==6)throw new Error(`Bundle de polices incomplet : ${paths.length}/6 fichiers résolus.`);
  for(const file of paths)fs.accessSync(file,fs.constants.R_OK);
  fs.accessSync(compositor.OFFICIAL_LOGO_PATH,fs.constants.R_OK);
  runtimeCache={sharp,opentype,compositor};
  return runtimeCache;
}

function json(statusCode,body){return {statusCode,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)};}
function runtimeFailure(error){return json(500,{ok:false,errorType:String(error?.name||"RuntimeImportError"),errorMessage:String(error?.message||error),recomposeVersion:RECOMPOSE_VERSION,expectedFonts:EXPECTED_FONTS,imageGenerationCalls:0});}
function healthcheck(){try{const {compositor}=loadCompositorRuntime();return json(200,{ok:true,recomposeVersion:RECOMPOSE_VERSION,compositorVersion:compositor.COMPOSITOR_VERSION,logoAsset:"assets/sdz-logo-compositor.png",fonts:{cormorant600:true,manrope500:true,manrope600:true},imageGenerationCalls:0});}catch(error){return runtimeFailure(error);}}

function store(name){const opts={consistency:"strong"};if(process.env.BLOBS_SITE_ID&&process.env.BLOBS_TOKEN)return getStore({name,siteID:process.env.BLOBS_SITE_ID,token:process.env.BLOBS_TOKEN,...opts});return getStore({name,...opts});}
function isRecoverableOriginal(job){return job?.status==="completed"&&Boolean(job.rawResultKey)&&Boolean(job.v3Plan)&&Boolean(job.v3Finalization?.analysis)&&!job.recomposedFrom;}

async function findLatestRecoverableJob(jobs){
  const listing=jobs.list({prefix:"jobs/",paginate:true}),blobs=[];
  if(listing&&typeof listing[Symbol.asyncIterator]==="function")for await(const page of listing)blobs.push(...(page?.blobs||[]));else{const page=await listing;blobs.push(...(Array.isArray(page)?page:(page?.blobs||[])));}
  const rootKeys=blobs.map(item=>typeof item==="string"?item:item?.key).filter(key=>/^jobs\/[^/]+$/.test(String(key||""))),candidates=[];
  for(const key of rootKeys){try{const raw=await jobs.get(key);if(!raw)continue;const job=typeof raw==="string"?JSON.parse(raw):raw;if(isRecoverableOriginal(job))candidates.push(job);}catch(error){}}
  const paid=candidates.filter(job=>Number(job.imageGenerationCallCount)>=1),eligible=paid.length?paid:candidates;eligible.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  if(typeof jobs.getMetadata!=="function")return eligible[0]||null;
  for(const job of eligible)if(await jobs.getMetadata(job.rawResultKey))return job;
  return null;
}

async function latestRecoverableJob(jobs=store("viewfinder-image-jobs")){try{const job=await findLatestRecoverableJob(jobs);if(!job)return json(200,{ok:true,found:false,imageGenerationCalls:0});return json(200,{ok:true,found:true,jobId:job.jobId,createdAt:job.createdAt,status:job.status,platform:job.v3Plan?.artDirection?.platform||null,rawResultAvailable:true,imageGenerationCalls:0});}catch(error){return json(500,{ok:false,found:false,error:String(error.message||error),imageGenerationCalls:0});}}
async function rawBuffer(record){if(record.b64)return Buffer.from(record.b64,"base64");if(!record.url)throw new Error("Photographie brute indisponible.");const res=await fetch(record.url);if(!res.ok)throw new Error("Photographie brute distante inaccessible.");return Buffer.from(await res.arrayBuffer());}
function recoveryFailure(statusCode,errorCode,error){return json(statusCode,{ok:false,recoverable:false,errorCode,error,imageGenerationCalls:0});}

async function resolveOriginalSource(jobs,sourceJobId){let jobId=sourceJobId;const visited=new Set();for(let depth=0;depth<8;depth++){if(visited.has(jobId))throw new Error("Chaîne de recomposition cyclique.");visited.add(jobId);const raw=await jobs.get(`jobs/${jobId}`);if(!raw)return {jobId,source:null};const source=typeof raw==="string"?JSON.parse(raw):raw;if(!source.recomposedFrom)return {jobId,source};jobId=source.recomposedFrom;}throw new Error("Chaîne de recomposition trop profonde.");}

exports.handler=async event=>{
  if(event.httpMethod==="GET"&&event.queryStringParameters?.health==="1")return healthcheck();
  if(event.httpMethod==="GET"&&event.queryStringParameters?.latest==="1")return latestRecoverableJob();
  if(event.httpMethod!=="POST")return json(405,{error:"Method Not Allowed",imageGenerationCalls:0});
  let composeBrandPoster;
  try{({compositor:{composeBrandPoster}}=loadCompositorRuntime());}catch(error){return runtimeFailure(error);}
  try{
    const body=JSON.parse(event.body||"{}");
    if(!body.sourceJobId||!body.platform)return json(400,{error:"sourceJobId et platform requis",imageGenerationCalls:0});
    const jobs=store("viewfinder-image-jobs"),resolved=await resolveOriginalSource(jobs,body.sourceJobId);
    if(!resolved.source)return recoveryFailure(404,"SOURCE_JOB_MISSING","Le travail image original est introuvable.");
    const source=resolved.source,recoverySourceJobId=resolved.jobId;
    if(!source.rawResultKey)return recoveryFailure(409,"RAW_SOURCE_MISSING","La photographie originale n'est plus disponible sur le serveur. Aucune nouvelle génération n'a été lancée.");
    if(!source.v3Plan)return recoveryFailure(409,"V3_PLAN_MISSING","Le plan créatif original n'est plus disponible.");
    if(!source.v3Finalization?.analysis)return recoveryFailure(409,"V3_ANALYSIS_MISSING","L'analyse visuelle originale n'est plus disponible.");
    const matrix=compatibilityMatrix(source.v3Finalization.analysis),platform=normalizePlatform(body.platform),compatibility=matrix[platform];
    if(!compatibility?.platformAdaptationPossible)return json(409,{error:compatibility?.reason||"Format incompatible",platformAdaptationPossible:false,estimatedAdditionalPhotoEur:body.estimatedAdditionalPhotoEur||null,requiresExplicitConfirmation:true,imageGenerationCalls:0});
    const rawRecord=await jobs.get(source.rawResultKey);
    if(!rawRecord)return recoveryFailure(410,"RAW_SOURCE_MISSING","La photographie originale n'est plus disponible sur le serveur. Aucune nouvelle génération n'a été lancée.");
    let image;try{image=await rawBuffer(typeof rawRecord==="string"?JSON.parse(rawRecord):rawRecord);}catch(error){return recoveryFailure(410,"RAW_SOURCE_MISSING","La photographie originale n'est plus disponible sur le serveur. Aucune nouvelle génération n'a été lancée.");}
    const analysis=analyzeActualImage(source.v3Finalization.analysis),layout=chooseLayout({platform,contract:source.v3Plan.contract,analysis});layout.cropPosition=cropPosition(analysis);
    const final=await composeBrandPoster({imageBuffer:image,platform,headline:String(body.headline||""),zoneText:String(body.zoneText||""),selectedLayout:layout,posterStrategy:source.v3Plan.posterStrategy});
    const compositionManifest=final.compositionManifest||null;
    const quality=assessQuality({contract:source.v3Plan.contract,sceneIntent:source.v3Plan.sceneIntent||null,analysis,composition:{imageExists:true,logoIntegrity:compositionManifest?.logoWithinCanvas!==false,logoAssetIntegrity:compositionManifest?.logoAssetIntegrity!==false,logoFringeDetected:compositionManifest?.logoFringeDetected===true,logoScaleValid:compositionManifest?.logoScaleValid!==false,marginsValid:compositionManifest?.marginsValid!==false,textWithinCanvas:compositionManifest?.textWithinCanvas!==false&&compositionManifest?.titleExact!==false&&compositionManifest?.subtitleExact!==false,protectedCollision:compositionManifest?.zonesDisjoint===false,logoRectangleOpaque:compositionManifest?.logoRectangleOpaque===true,contrastValid:true,gazeHierarchyValid:compositionManifest?.hierarchyValid!==false,thumbnailImpact:true}});
    const derivedJobId=crypto.randomUUID(),resultKey=`jobs/${derivedJobId}/result`;
    await jobs.set(resultKey,JSON.stringify({b64:final.toString("base64"),url:null,brandComposited:true,recomposedFrom:recoverySourceJobId,compositionManifest}));
    await jobs.set(`jobs/${derivedJobId}`,JSON.stringify({jobId:derivedJobId,status:"completed",createdAt:Date.now(),updatedAt:Date.now(),resultKey,rawResultKey:source.rawResultKey,v3Plan:source.v3Plan,v3Finalization:{analysis,layout,quality,compositionManifest},recomposedFrom:recoverySourceJobId,costAudit:buildCostAudit({mode:"recompose",visionUsage:false,imageCalls:0})}));
    await jobs.set(`jobs/${recoverySourceJobId}`,JSON.stringify({...source,derivedVersions:[...(source.derivedVersions||[]),derivedJobId],updatedAt:Date.now()}));
    return json(200,{ok:true,jobId:derivedJobId,recoverySourceJobId,resultUrl:`/.netlify/functions/get-image-result?jobId=${derivedJobId}`,platform,layout,quality,compositionManifest,costAudit:buildCostAudit({mode:"recompose",visionUsage:false,imageCalls:0}),imageGenerationCalls:0});
  }catch(error){return json(500,{error:String(error.message||error),recomposeVersion:RECOMPOSE_VERSION,imageGenerationCalls:0});}
};

exports.rawBuffer=rawBuffer;
exports.healthcheck=healthcheck;
exports.loadCompositorRuntime=loadCompositorRuntime;
exports.RECOMPOSE_VERSION=RECOMPOSE_VERSION;
exports.isRecoverableOriginal=isRecoverableOriginal;
exports.findLatestRecoverableJob=findLatestRecoverableJob;
exports.latestRecoverableJob=latestRecoverableJob;
exports.resolveOriginalSource=resolveOriginalSource;
