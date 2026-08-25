"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sharp=require("sharp");
const root=path.resolve(__dirname,"..");

test("le serveur ne référence plus l'ancienne police et charge les trois graisses requises",()=>{
  const files=["package.json","package-lock.json","netlify.toml","netlify/functions/_shared/brand-compositor.js","netlify/functions/_shared/v3-brand-tokens.js","index.html","tests/v3-golden-target.test.js"];
  const retiredFamily=new RegExp(["cin","zel"].join(""),"i");
  for(const file of files)assert.doesNotMatch(fs.readFileSync(path.join(root,file),"utf8"),retiredFamily,file);
  const pkg=require("../package.json");
  assert.ok(pkg.dependencies["@fontsource/cormorant-garamond"]);
  assert.ok(pkg.dependencies["@fontsource/manrope"]);
  const tokens=require("../netlify/functions/_shared/v3-brand-tokens");
  assert.deepEqual([tokens.titleFont,tokens.subtitleFont,tokens.brandFont],["Cormorant Garamond 600","Manrope 500","Manrope 600"]);
});

test("les deux fonctions Netlify embarquent explicitement toutes les dépendances du compositor",()=>{
  const config=fs.readFileSync(path.join(root,"netlify.toml"),"utf8");
  for(const fn of ["process-image-job-background","recompose-image-job"]){
    const block=config.match(new RegExp(`\\[functions\\."${fn}"\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    assert.ok(block,fn);
    for(const dependency of ["sharp","opentype.js","@fontsource/cormorant-garamond","@fontsource/manrope"])assert.match(block[1],new RegExp(dependency.replace(".","\\.")),`${fn}: ${dependency}`);
    assert.equal((block[1].match(/\.woff"/g)||[]).length,6,`${fn}: six WOFF explicites`);
  }
});

test("le compositor et la recomposition sont importables dans un runtime serveur",()=>{
  const compositor=require("../netlify/functions/_shared/brand-compositor");
  assert.equal(Object.keys(compositor.FONT_PATHS).length,6);
  for(const file of Object.values(compositor.FONT_PATHS))assert.equal(fs.statSync(file).isFile(),true,file);
  const source=fs.readFileSync(path.join(root,"netlify/functions/_shared/brand-compositor.js"),"utf8");
  assert.equal((source.match(/require\.resolve\("@fontsource\//g)||[]).length,6);
  assert.doesNotMatch(source,/require\.resolve\(`@fontsource/);
  assert.doesNotThrow(()=>require("../netlify/functions/recompose-image-job"));
});

test("le healthcheck gratuit prouve le bundle sans lire de job ni générer d'image",async()=>{
  const recompose=require("../netlify/functions/recompose-image-job");
  const response=await recompose.handler({httpMethod:"GET",queryStringParameters:{health:"1"}});
  const body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);
  assert.equal(body.ok,true);
  assert.equal(body.recomposeVersion,"2.1.0-font-bundle-diagnostic");
  assert.equal(body.compositorVersion,"2.1.0-static-font-bundle");
  assert.deepEqual(body.fonts,{cormorant600:true,manrope500:true,manrope600:true});
  assert.equal(body[["cin","zel"].join("")],false);
  assert.equal(body.imageGenerationCalls,0);
});

test("latest ignore sous-clés, échecs, dérivés et jobs incomplets puis choisit l'original payé le plus récent",async()=>{
  const {findLatestRecoverableJob,latestRecoverableJob}=require("../netlify/functions/recompose-image-job");
  const valid=(jobId,createdAt,extra={})=>({jobId,createdAt,status:"completed",rawResultKey:`jobs/${jobId}/raw-result`,v3Plan:{artDirection:{platform:"Story"}},v3Finalization:{analysis:{}},imageGenerationCallCount:1,...extra});
  const records={
    "jobs/old":valid("old",100),
    "jobs/new":valid("new",300),
    "jobs/derived":valid("derived",500,{recomposedFrom:"old",imageGenerationCallCount:0}),
    "jobs/failed":{...valid("failed",600),status:"failed"},
    "jobs/no-raw":{...valid("no-raw",700),rawResultKey:null},
    "jobs/new/result":JSON.stringify({b64:"ne doit jamais être lu"}),
  };
  const readKeys=[];
  const jobs={list:async options=>{assert.deepEqual(options,{prefix:"jobs/"});return {blobs:Object.keys(records).map(key=>({key}))};},get:async key=>{readKeys.push(key);return typeof records[key]==="string"?records[key]:JSON.stringify(records[key]);}};
  assert.equal((await findLatestRecoverableJob(jobs)).jobId,"new");
  assert.equal(readKeys.includes("jobs/new/result"),false);
  const response=await latestRecoverableJob(jobs),body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);
  assert.deepEqual(body,{ok:true,found:true,jobId:"new",createdAt:300,status:"completed",platform:"Story",rawResultAvailable:true,imageGenerationCalls:0});
});

test("latest retourne found false gratuitement quand aucun original n'est récupérable",async()=>{
  const {latestRecoverableJob}=require("../netlify/functions/recompose-image-job");
  const response=await latestRecoverableJob({list:async()=>({blobs:[{key:"jobs/x/result"}]}),get:async()=>{throw new Error("sous-clé lue");}});
  assert.deepEqual(JSON.parse(response.body),{ok:true,found:false,imageGenerationCalls:0});
});

test("l'interface affiche et utilise la récupération serveur quand le stockage local est vide",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.match(html,/if\(!readRecoverableImageJobs\(\)\.length\)\{[\s\S]*readLatestRecoverableImageJobFromServer\(\)[\s\S]*recoverServerBtn\.style\.display=record\?"inline-block":"none"/);
  assert.match(html,/readRecoverableImageJobs\(\)\[0\]\|\|serverRecoverableRecord/);
  assert.match(html,/recompose-image-job\?latest=1/);
});

test("Story compose UNE HISTOIRE À PARTAGER sans troncature, collision ni fond opaque",async()=>{
  const {composeBrandPoster}=require("../netlify/functions/_shared/brand-compositor");
  const imageBuffer=await sharp({create:{width:1080,height:1920,channels:4,background:"#5b5148"}}).png().toBuffer();
  const logoBuffer=fs.readFileSync(path.join(root,"icons/icon-512.png"));
  const output=await composeBrandPoster({
    imageBuffer,
    logoDataUrl:`data:image/png;base64,${logoBuffer.toString("base64")}`,
    platform:"Story",
    posterStrategy:{
      textMode:"TEXT_MODE_EDITORIAL",
      title:"UNE HISTOIRE À PARTAGER",
      subtitle:"L’UNIVERS SDZ",
      titleLines:["UNE HISTOIRE","À PARTAGER"],
      subtitleLines:["L’UNIVERS SDZ"],
      textSafeArea:{top:.61,bottom:.72,left:.07,right:.93},
      logoSafeArea:{top:.75,bottom:.82,left:.22,right:.78},
      logoScale:"discreet",
    },
  });
  const meta=await sharp(output).metadata();
  const manifest=output.compositionManifest;
  assert.deepEqual([meta.width,meta.height],[1080,1920]);
  assert.deepEqual(manifest.titleLines,["UNE HISTOIRE","À PARTAGER"]);
  assert.deepEqual(manifest.subtitleLines,["L’UNIVERS SDZ"]);
  for(const key of ["titleExact","subtitleExact","textWithinCanvas","marginsValid","hierarchyValid","zonesDisjoint","logoWithinCanvas","semanticLinesValid"])assert.equal(manifest[key],true,key);
  assert.equal(manifest.logoRectangleOpaque,false);
  assert.ok(manifest.titleSize>manifest.subtitleSize);
  assert.ok(manifest.titleBounds.top>=manifest.textSafeArea.top);
  assert.ok(manifest.titleBounds.bottom<=manifest.textSafeArea.bottom);
  assert.ok(manifest.subtitleBounds.bottom<=manifest.textSafeArea.bottom);
  assert.ok(manifest.logoBounds.left>=0&&manifest.logoBounds.right<=manifest.width);
  assert.ok(manifest.logoBounds.top>=manifest.textSafeArea.bottom);
  assert.ok(manifest.logoBounds.bottom<manifest.height);
});
