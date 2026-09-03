"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sharp=require("sharp");
const {applyImageEditOptions,normalizeImageModel}=require("../netlify/functions/_shared/openai-image-edit-options");
const {composeBrandPoster,loadOfficialLogoAsset,auditLogoTransparency,OFFICIAL_LOGO_PATH,PREMIUM_LOCKUP_BY_PLATFORM,BRAND_TOKENS}=require("../netlify/functions/_shared/brand-compositor");

const root=path.resolve(__dirname,"..");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const worker=fs.readFileSync(path.join(root,"netlify/functions/process-image-job-background.js"),"utf8");
const compositor=fs.readFileSync(path.join(root,"netlify/functions/_shared/brand-compositor.js"),"utf8");
const netlify=fs.readFileSync(path.join(root,"netlify.toml"),"utf8");

test("gpt-image-2 reste le modèle image par défaut sans input_fidelity",()=>{
  assert.equal(normalizeImageModel(),"gpt-image-2");
  const form=new FormData();form.set("input_fidelity","high");applyImageEditOptions(form,{quality:"high"});
  assert.equal(form.get("model"),"gpt-image-2");assert.equal(form.has("input_fidelity"),false);assert.equal(form.get("quality"),"high");
});

test("quatre références maximum restent réservées aux produits ou à la scène",()=>{
  assert.match(worker,/slice\(0,4\)/);assert.match(worker,/slice\(0,4-urls\.length\)/);assert.match(index,/smartReferenceDataUrls[\s\S]*slice\(0,4\)/);
});

test("le logo du compositeur est désormais un actif statique construit au build",()=>{
  assert.equal(path.normalize(OFFICIAL_LOGO_PATH),path.normalize(path.join(root,"assets/sdz-logo-compositor.png")));
  assert.ok(fs.existsSync(OFFICIAL_LOGO_PATH),"npm run build:logo doit précéder les tests");
  assert.match(netlify,/node scripts\/build-sdz-logo-asset\.js && node scripts\/verify-index-integrity\.js/);
  assert.match(netlify,/assets\/sdz-logo-compositor\.png/);
  assert.doesNotMatch(compositor,/removeBorderConnectedDarkBackground|TRANSPARENT_LOGO_CACHE|prepareLogoOverlay|buildLogoSilhouetteMask/);
  assert.doesNotMatch(worker,/vf-logo-asset|openBrandStore/);
});

test("l'actif logo a un extérieur réellement transparent, sans frange sombre, et conserve le noir intérieur",async()=>{
  const official=await loadOfficialLogoAsset(),audit=await auditLogoTransparency(official.buffer);
  assert.equal(audit.integrity,true);assert.equal(audit.fringeDetected,false);assert.ok(audit.transparentRatio>.04);assert.ok(audit.darkInteriorRatio>.02);
  const {data,info}=await sharp(official.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0,darkOpaque=0;
  for(let i=0;i<info.width*info.height;i++){const o=i*info.channels,a=data[o+3],max=Math.max(data[o],data[o+1],data[o+2]);if(a<=8)transparent++;if(a>=245&&max<75)darkOpaque++;}
  assert.ok(transparent>0,"le fond extérieur doit être réellement alpha=0");assert.ok(darkOpaque>0,"les noirs internes du médaillon doivent rester opaques");
});

test("les tailles de logo respectent toutes la charte centralisée et Story n'est plus à 33 %",()=>{
  for(const [platform,lockup] of Object.entries(PREMIUM_LOCKUP_BY_PLATFORM)){
    assert.ok(lockup.logoWidthRatio>=BRAND_TOKENS.logoMinimumScale,`${platform} trop petit`);
    assert.ok(lockup.logoWidthRatio<=BRAND_TOKENS.logoMaximumScale,`${platform} trop grand`);
  }
  assert.ok(PREMIUM_LOCKUP_BY_PLATFORM.Story.logoWidthRatio<=.20);
  assert.ok(PREMIUM_LOCKUP_BY_PLATFORM["Instagram Portrait"].logoWidthRatio<=.18);
  assert.ok(PREMIUM_LOCKUP_BY_PLATFORM.Facebook.logoWidthRatio<=.18);
});

test("Sharp produit une Story finale avec manifeste de marque mesuré",async()=>{
  const imageBuffer=await sharp({create:{width:1008,height:1792,channels:4,background:"#17120b"}}).png().toBuffer();
  const finalBuffer=await composeBrandPoster({imageBuffer,platform:"Story",headline:"RETROUVEZ L'ÉQUILIBRE | MASSAGE AYURVÉDIQUE ABHYANGA",zoneText:"inférieure"});
  const meta=await sharp(finalBuffer).metadata(),m=finalBuffer.compositionManifest;
  assert.deepEqual([meta.width,meta.height],[1080,1920]);assert.equal(m.logoAssetSource,"assets/sdz-logo-compositor.png");assert.equal(m.logoAssetIntegrity,true);assert.equal(m.logoFringeDetected,false);assert.equal(m.logoScaleValid,true);assert.ok(m.logoMedallionWidthRatio<=BRAND_TOKENS.logoMaximumScale+.005);assert.equal(m.logoRectangleOpaque,false);
});

test("Sharp produit aussi le format Instagram avec textes vectoriels",async()=>{
  const imageBuffer=await sharp({create:{width:1088,height:1360,channels:4,background:"#17120b"}}).png().toBuffer();
  const finalBuffer=await composeBrandPoster({imageBuffer,platform:"Instagram",headline:"MASSAGE JAPONAIS | ÉCLAT NATUREL",zoneText:"inférieure"});
  const meta=await sharp(finalBuffer).metadata();assert.deepEqual([meta.width,meta.height],[1080,1350]);assert.doesNotMatch(compositor,/<text /);assert.ok(finalBuffer.length>20_000);
});

test("aucun fallback fournisseur ne peut déclencher une seconde génération",()=>{
  assert.doesNotMatch(worker,/providerSafetyFallback|buildProviderSafeBodyworkPrompt|bodyworkSafetyFallbackEligible|isProviderSafetyRejection/);
  assert.match(worker,/ce bloc contient l'unique appel Images du job/);
  assert.match(worker,/retries:0,imageCalls:1/);
  const generationCalls=(worker.match(/generateStandard\(\{key,prompt,size,model,quality\}\)/g)||[]).length;
  assert.equal(generationCalls,1,"un seul appel standard doit exister dans le chemin de génération");
});

test("le compositeur serveur conserve marges, zones distinctes et mesures exactes",()=>{
  assert.match(compositor,/function fitTypography/);assert.match(compositor,/textArea/);assert.match(compositor,/logoArea/);assert.match(compositor,/Collision entre la zone de texte et la zone du logo/);assert.match(compositor,/logoAssetIntegrity/);assert.match(compositor,/logoFringeDetected/);assert.match(compositor,/logoScaleValid/);
});

test("les formats gpt-image-2 suivent les ratios de publication",()=>{
  assert.match(index,/"Story": "1008x1792"/);assert.match(index,/"Instagram": "1088x1360"/);assert.match(index,/"Article Blog Wix": "1920x1088"/);
});
