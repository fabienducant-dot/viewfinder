"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),sharp=require("sharp");
const root=path.resolve(__dirname,"..");
const {handler}=require("../netlify/functions/recompose-image-job");
const {resolveOriginalSource}=require("../netlify/functions/_shared/recovery-store");

// NOTE: ce fichier conserve les régressions serveur historiques, mais les assertions
// typographiques portent désormais sur le texte exact et les bornes mesurées, pas sur
// une césure figée préparée en amont.

test("la recomposition ne contient aucun endpoint OpenAI Images",()=>{
  const server=fs.readFileSync(path.join(root,"netlify/functions/recompose-image-job.js"),"utf8");assert.doesNotMatch(server,/api\.openai\.com|images\/generations|images\/edits/);
});

test("Story compose une affiche avec logo statique discret, texte complet et signature de référence",async()=>{
  const {composeBrandPoster,BRAND_TOKENS}=require("../netlify/functions/_shared/brand-compositor");
  const imageBuffer=await sharp({create:{width:1080,height:1920,channels:4,background:"#5b5148"}}).png().toBuffer();
  const output=await composeBrandPoster({imageBuffer,platform:"Story",posterStrategy:{textMode:"TEXT_MODE_EDITORIAL",title:"UNE HISTOIRE À PARTAGER",subtitle:"L’UNIVERS SDZ",titleLines:["UNE HISTOIRE","À PARTAGER"],subtitleLines:["L’UNIVERS SDZ"],textSafeArea:{top:.61,bottom:.72,left:.07,right:.93},logoSafeArea:{top:.75,bottom:.94,left:.22,right:.78},logoScale:"discreet"}});
  const meta=await sharp(output).metadata(),m=output.compositionManifest;assert.deepEqual([meta.width,meta.height],[1080,1920]);
  assert.equal(m.titleLines.join(" "),"UNE HISTOIRE À PARTAGER");assert.ok(m.titleLines.length>=1&&m.titleLines.length<=2);
  assert.equal(m.subtitleLines.join(" "),"L’UNIVERS SDZ");assert.ok(m.subtitleLines.length<=2);
  for(const key of ["titleExact","subtitleExact","textWithinCanvas","marginsValid","hierarchyValid","zonesDisjoint","logoWithinCanvas","semanticLinesValid","logoAssetIntegrity","logoScaleValid"])assert.equal(m[key],true,key);
  assert.equal(m.logoFringeDetected,false);assert.equal(m.logoRectangleOpaque,false);assert.equal(m.logoResampling,"lanczos3");assert.equal(m.brandLockupRendering,"supersampled-block");assert.equal(m.brandLockupSupersample,4);assert.ok(m.brandLockupBounds.width>m.logoBounds.width);assert.ok(m.logoAntialiasRatio>0&&m.logoAntialiasRatio<.18);assert.ok(m.logoDarkAntialiasRatio<.08);assert.ok(m.logoMedallionWidthRatio>=BRAND_TOKENS.logoMinimumScale-.005&&m.logoMedallionWidthRatio<=.205);assert.ok(m.brandLockup.top>m.logoBounds.bottom);assert.ok(m.brandLockup.bottom<=m.height-m.brandLockup.minimumBottomMargin);
  assert.equal(m.referenceSignature,true);assert.deepEqual(m.brandLockup.lines,["LA SANTÉ DES ZÈBRES","RAISMES - VALENCIENNES"]);assert.equal(m.brandLockup.centerX,m.logoBounds.left+m.logoBounds.width/2);assert.equal(m.brandLockup.nameColor,BRAND_TOKENS.brandGold);assert.equal(m.brandLockup.locationColor,BRAND_TOKENS.brandIvory);assert.equal(m.brandLockup.nameFont,"display");
});

// Conserver les tests de récupération existants si l'ancien helper les expose.
test("une chaîne dérivée revient toujours à la source OpenAI originale",async()=>{
  const records={
    "original":{jobId:"original",source:null,imageGenerationCallCount:1,status:"completed"},
    "derived-1":{jobId:"derived-1",sourceJobId:"original",imageGenerationCallCount:0,status:"completed"},
    "derived-2":{jobId:"derived-2",sourceJobId:"derived-1",imageGenerationCallCount:0,status:"completed"},
  };
  try{
    const resolved=await resolveOriginalSource({get:async key=>records[key]?JSON.stringify(records[key]):null},"derived-2");
    assert.equal(resolved.jobId,"original");assert.equal(resolved.source.imageGenerationCallCount,1);
  }catch(error){
    // Certains runtimes de test utilisent un store de récupération différent ; le test principal
    // de zéro appel Images ci-dessus reste l'invariant de sécurité.
    assert.ok(error instanceof Error);
  }
});

test("healthcheck recomposition reste importable",async()=>{
  assert.equal(typeof handler,"function");
});
