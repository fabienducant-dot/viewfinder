"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sharp=require("sharp");
const root=path.resolve(__dirname,"..");

test("le serveur charge les trois graisses requises",()=>{
  const pkg=require("../package.json");
  assert.ok(pkg.dependencies["@fontsource/cormorant-garamond"]);assert.ok(pkg.dependencies["@fontsource/manrope"]);
  const tokens=require("../netlify/functions/_shared/v3-brand-tokens");
  assert.deepEqual([tokens.titleFont,tokens.subtitleFont,tokens.brandFont],["Cormorant Garamond 600","Manrope 500","Manrope 600"]);
});

test("les deux fonctions Netlify embarquent polices, Sharp et actif logo statique",()=>{
  const config=fs.readFileSync(path.join(root,"netlify.toml"),"utf8");
  for(const fn of ["process-image-job-background","recompose-image-job"]){
    const block=config.match(new RegExp(`\\[functions\\."${fn}"\\]([\\s\\S]*?)(?=\\n\\[|$)`));assert.ok(block,fn);
    for(const dependency of ["sharp","opentype.js","@fontsource/cormorant-garamond","@fontsource/manrope"])assert.match(block[1],new RegExp(dependency.replace(".","\\.")),`${fn}: ${dependency}`);
    assert.equal((block[1].match(/\.woff"/g)||[]).length,6,`${fn}: six WOFF explicites`);
    assert.match(block[1],/assets\/sdz-logo-compositor\.png/);
  }
});

test("le compositor et la recomposition sont importables dans un runtime serveur",()=>{
  const compositor=require("../netlify/functions/_shared/brand-compositor");
  assert.equal(Object.keys(compositor.FONT_PATHS).length,6);for(const file of Object.values(compositor.FONT_PATHS))assert.equal(fs.statSync(file).isFile(),true,file);
  assert.equal(fs.statSync(compositor.OFFICIAL_LOGO_PATH).isFile(),true);
  assert.doesNotThrow(()=>require("../netlify/functions/recompose-image-job"));
});

test("le healthcheck gratuit prouve le bundle statique sans génération",async()=>{
  const recompose=require("../netlify/functions/recompose-image-job"),response=await recompose.handler({httpMethod:"GET",queryStringParameters:{health:"1"}}),body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);assert.equal(body.ok,true);assert.equal(body.recomposeVersion,"3.1.0-fast-recovery");assert.equal(body.compositorVersion,"3.4.0-high-quality-logo-resampling");assert.equal(body.logoAsset,"assets/sdz-logo-compositor.png");assert.deepEqual(body.fonts,{cormorant600:true,manrope500:true,manrope600:true});assert.equal(body.imageGenerationCalls,0);
});

test("le master logo complet conserve le disque noir, le triangle et un extérieur transparent",async()=>{
  const {loadOfficialLogoAsset}=require("../netlify/functions/_shared/brand-compositor");
  const official=await loadOfficialLogoAsset(),a=official.audit;
  assert.ok(a.width>=850&&a.height>=950,`${a.width}x${a.height}`);
  assert.ok(a.aspectRatio>.86&&a.aspectRatio<.97,`ratio ${a.aspectRatio}`);
  assert.ok(a.darkInteriorRatio>.50,`noir intérieur ${a.darkInteriorRatio}`);
  assert.ok(a.transparentRatio>.20&&a.transparentRatio<.50,`transparence ${a.transparentRatio}`);
  assert.equal(a.fringeDetected,false);
});

test("la signature de référence s'applique à tous les formats premium mais pas à Google",()=>{
  const {signatureForPlatform,BRAND_TOKENS}=require("../netlify/functions/_shared/brand-compositor");
  for(const platform of ["Story","Instagram Square","Instagram Portrait","Facebook","Blog","Bannière"]){
    const s=signatureForPlatform(platform);assert.deepEqual([s.name,s.location],["LA SANTÉ DES ZÈBRES","RAISMES - VALENCIENNES"],platform);assert.equal(s.nameColor,BRAND_TOKENS.brandGold,platform);assert.equal(s.locationColor,BRAND_TOKENS.brandIvory,platform);assert.equal(s.nameFont,"display",platform);
  }
  const google=signatureForPlatform("Google Business");assert.deepEqual([google.name,google.location],["LA SANTÉ DES ZÈBRES","RAISMES"]);assert.equal(google.locationColor,BRAND_TOKENS.brandGold);
});

test("latest choisit l'original payé récupérable le plus récent sans scanner les sous-clés",async()=>{
  const {findLatestRecoverableJob,latestRecoverableJob}=require("../netlify/functions/recompose-image-job");
  const valid=(jobId,createdAt,extra={})=>({jobId,createdAt,status:"completed",rawResultKey:`jobs/${jobId}/raw-result`,v3Plan:{artDirection:{platform:"Story"}},v3Finalization:{analysis:{}},imageGenerationCallCount:1,...extra});
  const records={"jobs/old":valid("old",100),"jobs/new":valid("new",300),"jobs/dead":valid("dead",400),"jobs/derived":valid("derived",500,{recomposedFrom:"old",imageGenerationCallCount:0}),"jobs/failed":{...valid("failed",600),status:"failed"},"jobs/no-raw":{...valid("no-raw",700),rawResultKey:null},"jobs/new/result":JSON.stringify({b64:"ne doit jamais être lu"})};
  const readKeys=[],jobs={list:async options=>{assert.deepEqual(options,{prefix:"jobs/",directories:true});return {blobs:Object.keys(records).filter(key=>/^jobs\/[^/]+$/.test(key)).map(key=>({key})),directories:["jobs/new"]};},get:async key=>{readKeys.push(key);return typeof records[key]==="string"?records[key]:JSON.stringify(records[key]);},getMetadata:async key=>key!=="jobs/dead/raw-result"?{etag:"ok",metadata:{}}:null};
  assert.equal((await findLatestRecoverableJob(jobs)).jobId,"new");assert.equal(readKeys.includes("jobs/new/result"),false);
  const response=await latestRecoverableJob(jobs),body=JSON.parse(response.body);assert.equal(response.statusCode,200);assert.equal(body.jobId,"new");assert.equal(body.imageGenerationCalls,0);
});

test("latest retourne found false gratuitement sans original récupérable",async()=>{
  const {latestRecoverableJob}=require("../netlify/functions/recompose-image-job"),response=await latestRecoverableJob({list:async()=>({blobs:[{key:"jobs/x/result"}],directories:[]}),get:async()=>{throw new Error("sous-clé lue");}});
  assert.deepEqual(JSON.parse(response.body),{ok:true,found:false,imageGenerationCalls:0});
});

test("get-image-job protège les états terminaux et expire les travaux bloqués",async()=>{
  const {createHandler,JOB_MAX_AGE_MS,PROCESSING_TIMEOUT_MS}=require("../netlify/functions/get-image-job"),now=Date.now(),records=new Map(),writes=[];
  const handler=createHandler(()=>({get:async key=>records.get(key)||null,set:async(key,value)=>writes.push([key,JSON.parse(value)])})),request=jobId=>handler({httpMethod:"GET",queryStringParameters:{jobId}}),put=(jobId,job)=>records.set(`jobs/${jobId}`,JSON.stringify({jobId,createdAt:now,...job}));
  put("completed",{createdAt:now-JOB_MAX_AGE_MS-3600000,status:"completed",resultKey:"jobs/completed/result"});put("queued",{createdAt:now-JOB_MAX_AGE_MS-1,status:"queued"});put("processing",{createdAt:now-PROCESSING_TIMEOUT_MS-1,updatedAt:now-PROCESSING_TIMEOUT_MS-1,status:"processing"});put("failed",{status:"failed",error:{message:"source"},imageGenerationCallCount:1});
  assert.equal(JSON.parse((await request("completed")).body).status,"completed");assert.equal((await request("queued")).statusCode,404);assert.equal(JSON.parse((await request("processing")).body).status,"failed");assert.equal(writes.length,1);assert.equal(JSON.parse((await request("failed")).body).status,"failed");
});

test("une chaîne dérivée revient toujours à la source OpenAI originale",async()=>{
  const {resolveOriginalSource}=require("../netlify/functions/recompose-image-job"),records={"jobs/derived-2":{jobId:"derived-2",recomposedFrom:"derived-1"},"jobs/derived-1":{jobId:"derived-1",recomposedFrom:"original"},"jobs/original":{jobId:"original",status:"completed",imageGenerationCallCount:1}};
  const resolved=await resolveOriginalSource({get:async key=>records[key]?JSON.stringify(records[key]):null},"derived-2");assert.equal(resolved.jobId,"original");assert.equal(resolved.source.imageGenerationCallCount,1);
});

test("la recomposition ne contient aucun endpoint OpenAI Images",()=>{
  const server=fs.readFileSync(path.join(root,"netlify/functions/recompose-image-job.js"),"utf8");assert.doesNotMatch(server,/api\.openai\.com|images\/generations|images\/edits/);
});

test("Story compose une affiche avec logo statique discret, texte complet et signature de référence",async()=>{
  const {composeBrandPoster,BRAND_TOKENS}=require("../netlify/functions/_shared/brand-compositor");
  const imageBuffer=await sharp({create:{width:1080,height:1920,channels:4,background:"#5b5148"}}).png().toBuffer();
  const output=await composeBrandPoster({imageBuffer,platform:"Story",posterStrategy:{textMode:"TEXT_MODE_EDITORIAL",title:"UNE HISTOIRE À PARTAGER",subtitle:"L’UNIVERS SDZ",titleLines:["UNE HISTOIRE","À PARTAGER"],subtitleLines:["L’UNIVERS SDZ"],textSafeArea:{top:.61,bottom:.72,left:.07,right:.93},logoSafeArea:{top:.75,bottom:.94,left:.22,right:.78},logoScale:"discreet"}});
  const meta=await sharp(output).metadata(),m=output.compositionManifest;assert.deepEqual([meta.width,meta.height],[1080,1920]);assert.deepEqual(m.titleLines,["UNE HISTOIRE","À PARTAGER"]);assert.deepEqual(m.subtitleLines,["L’UNIVERS SDZ"]);
  for(const key of ["titleExact","subtitleExact","textWithinCanvas","marginsValid","hierarchyValid","zonesDisjoint","logoWithinCanvas","semanticLinesValid","logoAssetIntegrity","logoScaleValid"])assert.equal(m[key],true,key);
  assert.equal(m.logoFringeDetected,false);assert.equal(m.logoRectangleOpaque,false);assert.equal(m.logoResampling,"lanczos3");assert.ok(m.logoAntialiasRatio>0&&m.logoAntialiasRatio<.18);assert.ok(m.logoDarkAntialiasRatio<.08);assert.ok(m.logoMedallionWidthRatio>=BRAND_TOKENS.logoMinimumScale-.005&&m.logoMedallionWidthRatio<=.205);assert.ok(m.brandLockup.top>m.logoBounds.bottom);assert.ok(m.brandLockup.bottom<=m.height-m.brandLockup.minimumBottomMargin);
  assert.equal(m.referenceSignature,true);assert.deepEqual(m.brandLockup.lines,["LA SANTÉ DES ZÈBRES","RAISMES - VALENCIENNES"]);assert.equal(m.brandLockup.centerX,m.logoBounds.left+m.logoBounds.width/2);assert.equal(m.brandLockup.nameColor,BRAND_TOKENS.brandGold);assert.equal(m.brandLockup.locationColor,BRAND_TOKENS.brandIvory);assert.equal(m.brandLockup.nameFont,"display");
});
