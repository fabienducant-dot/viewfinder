"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { applyImageEditOptions, normalizeImageModel } = require("../netlify/functions/_shared/openai-image-edit-options");
const { composeBrandPoster, prepareLogoOverlay, normalizeLogoRaster, buildLogoSilhouetteMask, vectorText } = require("../netlify/functions/_shared/brand-compositor");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "netlify/functions/process-image-job-background.js"), "utf8");

test("gpt-image-2 est le modèle image par défaut sans input_fidelity", () => {
  assert.equal(normalizeImageModel(), "gpt-image-2");
  const form = new FormData();
  form.set("input_fidelity", "high");
  applyImageEditOptions(form, { quality: "high" });
  assert.equal(form.get("model"), "gpt-image-2");
  assert.equal(form.has("input_fidelity"), false);
  assert.equal(form.get("quality"), "high");
});

test("le pipeline réserve quatre références produit ou scène, hors identité", () => {
  assert.match(worker, /slice\(0, 4\)/);
  assert.match(worker, /slice\(0, 4 - urls\.length\)/);
  assert.match(index, /smartReferenceDataUrls[\s\S]*slice\(0,4\)/);
});

test("l'ancien repli paysage générique reste désactivé", () => {
  assert.match(index, /if\(false && isBodyContact && fixed\.miseEnScene\)/);
  assert.match(index, /silhouette seule marchant ou ouvrant les bras/);
  assert.match(index, /geste professionnel de la prestation clairement visible/);
});

test("l'identité serveur exacte est obligatoire et contrôlée", () => {
  assert.match(index, /state\.aiLogoIntegration = true/);
  assert.match(index, /serverBrandCompositionUsed/);
  assert.match(index, /brandReferenceRequired/);
  assert.match(index, /officialLogoConformity/);
  assert.match(index, /expectedTextExact/);
  assert.match(index, /model: "gpt-image-2"/);
  assert.match(index, /quality: \(state\.costMode\|\|"test"\)==="production" \? "high" : "low"/);
  assert.match(index, /SORTIE BRUTE OBLIGATOIRE/);
  assert.match(worker, /composeBrandPoster/);
  assert.match(worker, /brandComposition/);
});

test("le compositeur serveur produit un PNG final au bon format", async () => {
  const imageBuffer = await sharp({
    create: { width: 1088, height: 1920, channels: 4, background: "#17120b" },
  }).png().toBuffer();
  const logoBuffer = fs.readFileSync(path.join(root, "icons/icon-512.png"));
  const finalBuffer = await composeBrandPoster({
    imageBuffer,
    logoDataUrl: `data:image/png;base64,${logoBuffer.toString("base64")}`,
    platform: "Story",
    headline: "RETROUVEZ L'ÉQUILIBRE | MASSAGE AYURVÉDIQUE ABHYANGA",
    zoneText: "supérieure",
  });
  const meta = await sharp(finalBuffer).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1920);
  assert.ok(finalBuffer.length > 20_000);
});

test("les textes de marque sont rendus en tracés vectoriels, accents compris", async () => {
  const imageBuffer = await sharp({
    create: { width:1088, height:1360, channels:4, background:"#17120b" },
  }).png().toBuffer();
  const logoBuffer = fs.readFileSync(path.join(root, "icons/icon-512.png"));
  const finalBuffer = await composeBrandPoster({
    imageBuffer,
    logoDataUrl:`data:image/png;base64,${logoBuffer.toString("base64")}`,
    platform:"Instagram",
    headline:"MASSAGE JAPONAIS | ÉCLAT NATUREL",
    zoneText:"supérieure",
  });
  assert.ok(finalBuffer.length > 30_000);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "netlify/functions/_shared/brand-compositor.js"), "utf8"), /<text /);
});

test("le détourage retire seulement le noir extérieur connecté aux bords", async () => {
  const sourceSvg=Buffer.from(`<svg width="180" height="180" xmlns="http://www.w3.org/2000/svg">
    <rect width="180" height="180" fill="#050505"/>
    <circle cx="88" cy="94" r="54" fill="#050505" stroke="#D9AD3B" stroke-width="7"/>
    <path d="M68 44 L88 12 L108 44 Z" fill="#050505" stroke="#D9AD3B" stroke-width="6"/>
    <path d="M126 124 C145 127 160 136 169 151" fill="none" stroke="#D9AD3B" stroke-width="7" stroke-linecap="round"/>
    <path d="M62 92 C76 72 98 72 113 92 C101 111 76 112 62 92 Z" fill="#D9AD3B"/>
  </svg>`);
  const opaqueLogo=await sharp(sourceSvg).png().toBuffer();
  const clean=await prepareLogoOverlay(opaqueLogo);
  const {data,info}=await sharp(clean).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixel=(x,y)=>Array.from(data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+4));
  assert.ok(info.width<180&&info.height<180,"le fond de bord doit être réellement rogné");
  assert.equal(pixel(0,0)[3],0,"un coin de la bounding box finale reste transparent");
  const center=pixel(Math.floor(info.width*.48),Math.floor(info.height*.55));
  assert.ok(center[3]>245,"le noir intérieur du médaillon reste opaque");
  assert.ok(Math.max(center[0],center[1],center[2])<40,"le noir intérieur du médaillon reste noir");
  const topBand=[];
  for(let y=0;y<Math.max(1,Math.floor(info.height*.25));y++)for(let x=Math.floor(info.width*.3);x<Math.ceil(info.width*.7);x++){
    const p=pixel(x,y);if(p[3]>245&&Math.max(p[0],p[1],p[2])<40)topBand.push(p);
  }
  assert.ok(topBand.length>0,"l'intérieur noir du triangle officiel est conservé");
  let ribbonGold=0,outerDark=0;
  for(let y=Math.floor(info.height*.65);y<info.height;y++)for(let x=Math.floor(info.width*.68);x<info.width;x++){
    const p=pixel(x,y),max=Math.max(p[0],p[1],p[2]),min=Math.min(p[0],p[1],p[2]);
    if(p[3]>180&&p[0]>130&&p[1]>80&&p[2]<120)ribbonGold++;
    if(p[3]>245&&max<70&&(max-min)<25)outerDark++;
  }
  assert.ok(ribbonGold>0,"la volute dorée reste visible");
  assert.ok(outerDark<Math.round(info.width*info.height*.015),"aucune grosse masse noire n'est inventée autour de la volute");
});

test("un logo non carré auto-orienté utilise exactement les dimensions du raster normalisé",async()=>{
  const orientedLogo=await sharp({create:{width:80,height:140,channels:3,background:"#050505"}})
    .composite([{input:Buffer.from('<svg width="80" height="140"><circle cx="40" cy="72" r="34" fill="#D9AD3B"/></svg>')}])
    .jpeg().withMetadata({orientation:6}).toBuffer();
  const normalized=await normalizeLogoRaster(orientedLogo);
  const normalizedMeta=await sharp(normalized).metadata();
  assert.deepEqual([normalizedMeta.width,normalizedMeta.height],[140,80]);
  const mask=buildLogoSilhouetteMask(normalizedMeta.width,normalizedMeta.height);
  const maskMeta=await sharp(mask).metadata();
  assert.deepEqual([maskMeta.width,maskMeta.height],[normalizedMeta.width,normalizedMeta.height]);
  await assert.doesNotReject(()=>prepareLogoOverlay(orientedLogo));
  const imageBuffer=await sharp({create:{width:1080,height:1920,channels:4,background:"#17120b"}}).png().toBuffer();
  await assert.doesNotReject(()=>composeBrandPoster({imageBuffer,logoDataUrl:`data:image/jpeg;base64,${orientedLogo.toString("base64")}`,platform:"Story",headline:"TEST ORIENTATION | MASQUE NORMALISÉ"}));
});

test("le contrôle final fait confiance au logo exact composé par le serveur et bloque encore l'OCR", () => {
  assert.match(index, /officialLogoConformity="exact"/);
  assert.match(index, /overlay\.rawOverlayDetected=overlay\.expectedTextExact!==true/);
  assert.match(index, /3\.2\.1-index-integrity/);
});

test("le lock-up serveur protège le sujet et sépare accroche, logo et signature", () => {
  const compositor = fs.readFileSync(path.join(root, "netlify/functions/_shared/brand-compositor.js"), "utf8");
  assert.match(compositor, /function fitTypography/);
  assert.match(compositor, /textArea:/);
  assert.match(compositor, /logoArea/);
  assert.match(compositor, /Collision entre la zone de texte et la zone du logo/);
  assert.match(index, /const brandSafePercent = platform === "Story" \? 32 : 38/);
  assert.match(index, /réserve les \$\{brandSafePercent\}% inférieurs du cadre comme champ éditorial/);
  assert.match(index, /fixed\.zoneTexte="inférieure"/);
});

test("les registres actifs imposent une rotation de vraies familles de lieux", () => {
  assert.match(index, /REGISTRY_ENVIRONMENT_FAMILIES/);
  assert.match(index, /terrasse_minerale_suspendue/);
  assert.match(index, /amphitheatre_rocheux/);
  assert.match(index, /verriere_biophilique/);
  assert.match(index, /sceneFamily: brief\.sceneFamily/);
});

test("la finalisation et le recontrôle reconnaissent toujours l'identité composée côté serveur", () => {
  assert.match(index, /const logoInScene = flow\.serverBrandCompositionUsed===true && flow\.brandComposited===true;[\s\S]*generatedOverlayViolation=logoInScene \? "" : findGeneratedOverlayViolation/);
  assert.match(index, /brandIntegrated: flow\.serverBrandCompositionUsed===true && flow\.brandComposited===true/);
  assert.match(index, /expectedHeadline: \(PLATFORM_OVERLAY\[flow\.inputs\?\.platform\]===/);
});

test("les formats gpt-image-2 suivent les ratios de publication", () => {
  assert.match(index, /"Story": "1008x1792"/);
  assert.match(index, /"Instagram": "1088x1360"/);
  assert.match(index, /"Article Blog Wix": "1920x1088"/);
});
