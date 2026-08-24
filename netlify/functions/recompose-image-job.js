"use strict";

const {getStore}=require("@netlify/blobs");
const crypto=require("crypto");
const fs=require("fs");
const {chooseLayout,analyzeActualImage,normalizePlatform}=require("./_shared/v3-layout-engine");
const {compatibilityMatrix,cropPosition}=require("./_shared/v3-campaign");
const {assessQuality}=require("./_shared/v3-quality");
const {buildCostAudit}=require("./_shared/v3-cost-control");

const RECOMPOSE_VERSION="2.1.0-font-bundle-diagnostic";
const EXPECTED_FONTS=Object.freeze(["Cormorant Garamond 600","Manrope 500","Manrope 600"]);
const retiredExpectedKey=["cin","zelExpected"].join("");
const retiredKey=["cin","zel"].join("");
let runtimeCache=null;

function loadCompositorRuntime(){
  if(runtimeCache)return runtimeCache;
  const sharp=require("sharp");
  const opentype=require("opentype.js");
  const compositor=require("./_shared/brand-compositor");
  const paths=Object.values(compositor.FONT_PATHS||{});
  if(paths.length!==6)throw new Error(`Bundle de polices incomplet : ${paths.length}/6 fichiers résolus.`);
  for(const file of paths)fs.accessSync(file,fs.constants.R_OK);
  runtimeCache={sharp,opentype,compositor};
  return runtimeCache;
}

function json(statusCode,body){
  return {statusCode,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)};
}

function runtimeFailure(error){
  return json(500,{
    ok:false,
    errorType:String(error?.name||"RuntimeImportError"),
    errorMessage:String(error?.message||error),
    recomposeVersion:RECOMPOSE_VERSION,
    expectedFonts:EXPECTED_FONTS,
    [retiredExpectedKey]:false,
    imageGenerationCalls:0,
  });
}

function healthcheck(){
  try{
    const {compositor}=loadCompositorRuntime();
    return json(200,{
      ok:true,
      recomposeVersion:RECOMPOSE_VERSION,
      compositorVersion:compositor.COMPOSITOR_VERSION,
      fonts:{cormorant600:true,manrope500:true,manrope600:true},
      [retiredKey]:false,
      imageGenerationCalls:0,
    });
  }catch(error){
    return runtimeFailure(error);
  }
}

function store(name){
  const opts={consistency:"strong"};
  if(process.env.BLOBS_SITE_ID&&process.env.BLOBS_TOKEN){
    return getStore({name,siteID:process.env.BLOBS_SITE_ID,token:process.env.BLOBS_TOKEN,...opts});
  }
  return getStore({name,...opts});
}

async function rawBuffer(record){
  if(record.b64)return Buffer.from(record.b64,"base64");
  if(!record.url)throw new Error("Photographie brute indisponible.");
  const res=await fetch(record.url);
  if(!res.ok)throw new Error("Photographie brute distante inaccessible.");
  return Buffer.from(await res.arrayBuffer());
}

exports.handler=async event=>{
  if(event.httpMethod==="GET"&&event.queryStringParameters?.health==="1")return healthcheck();
  if(event.httpMethod!=="POST")return json(405,{error:"Method Not Allowed",imageGenerationCalls:0});
  let composeBrandPoster;
  try{
    ({compositor:{composeBrandPoster}}=loadCompositorRuntime());
  }catch(error){
    return runtimeFailure(error);
  }
  try{
    const body=JSON.parse(event.body||"{}");
    if(!body.sourceJobId||!body.platform)return json(400,{error:"sourceJobId et platform requis",imageGenerationCalls:0});
    const jobs=store("viewfinder-image-jobs"),brand=store("viewfinder-data");
    const statusRaw=await jobs.get(`jobs/${body.sourceJobId}`);
    if(!statusRaw)return json(404,{error:"Job source introuvable",imageGenerationCalls:0});
    const source=JSON.parse(statusRaw);
    if(!source.rawResultKey||!source.v3Plan||!source.v3Finalization?.analysis)return json(409,{error:"Raw-result ou analyse V3 indisponible",imageGenerationCalls:0});
    const matrix=compatibilityMatrix(source.v3Finalization.analysis);
    const platform=normalizePlatform(body.platform);
    const compatibility=matrix[platform];
    if(!compatibility?.platformAdaptationPossible){
      return json(409,{error:compatibility?.reason||"Format incompatible",platformAdaptationPossible:false,estimatedAdditionalPhotoEur:body.estimatedAdditionalPhotoEur||null,requiresExplicitConfirmation:true,imageGenerationCalls:0});
    }
    const [rawRecord,logoRecord]=await Promise.all([jobs.get(source.rawResultKey),brand.get("vf-logo-asset")]);
    if(!rawRecord||!logoRecord)throw new Error("Photographie brute ou logo officiel absent.");
    const image=await rawBuffer(JSON.parse(rawRecord));
    const logo=JSON.parse(logoRecord);
    const analysis=analyzeActualImage(source.v3Finalization.analysis);
    const layout=chooseLayout({platform,contract:source.v3Plan.contract,analysis});
    layout.cropPosition=cropPosition(analysis);
    const final=await composeBrandPoster({imageBuffer:image,logoDataUrl:logo.dataUrl,platform,headline:String(body.headline||""),zoneText:String(body.zoneText||""),selectedLayout:layout,posterStrategy:source.v3Plan.posterStrategy});
    const compositionManifest=final.compositionManifest||null;
    const quality=assessQuality({contract:source.v3Plan.contract,analysis,composition:{imageExists:true,logoIntegrity:compositionManifest?.logoWithinCanvas!==false,marginsValid:compositionManifest?.marginsValid!==false,textWithinCanvas:compositionManifest?.textWithinCanvas!==false&&compositionManifest?.titleExact!==false&&compositionManifest?.subtitleExact!==false,protectedCollision:compositionManifest?.zonesDisjoint===false,logoRectangleOpaque:compositionManifest?.logoRectangleOpaque===true,contrastValid:true,gazeHierarchyValid:compositionManifest?.hierarchyValid!==false,thumbnailImpact:true}});
    const derivedJobId=crypto.randomUUID(),resultKey=`jobs/${derivedJobId}/result`;
    await jobs.set(resultKey,JSON.stringify({b64:final.toString("base64"),url:null,brandComposited:true,recomposedFrom:body.sourceJobId,compositionManifest}));
    await jobs.set(`jobs/${derivedJobId}`,JSON.stringify({jobId:derivedJobId,status:"completed",createdAt:Date.now(),updatedAt:Date.now(),resultKey,rawResultKey:source.rawResultKey,v3Plan:source.v3Plan,v3Finalization:{analysis,layout,quality,compositionManifest},recomposedFrom:body.sourceJobId,costAudit:buildCostAudit({mode:"recompose",visionUsage:false,imageCalls:0})}));
    const versions=[...(source.derivedVersions||[]),derivedJobId];
    await jobs.set(`jobs/${body.sourceJobId}`,JSON.stringify({...source,derivedVersions:versions,updatedAt:Date.now()}));
    return json(200,{ok:true,jobId:derivedJobId,resultUrl:`/.netlify/functions/get-image-result?jobId=${derivedJobId}`,platform,layout,quality,compositionManifest,costAudit:buildCostAudit({mode:"recompose",visionUsage:false,imageCalls:0}),imageGenerationCalls:0});
  }catch(error){
    return json(500,{error:String(error.message||error),recomposeVersion:RECOMPOSE_VERSION,imageGenerationCalls:0});
  }
};

exports.rawBuffer=rawBuffer;
exports.healthcheck=healthcheck;
exports.loadCompositorRuntime=loadCompositorRuntime;
exports.RECOMPOSE_VERSION=RECOMPOSE_VERSION;
