"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { applyImageEditOptions, normalizeImageModel } = require("../netlify/functions/_shared/openai-image-edit-options");
const { composeBrandPoster, prepareLogoOverlay, vectorText } = require("../netlify/functions/_shared/brand-compositor");

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

test("un logo opaque sur fond noir est détouré avant composition", async () => {
  const opaqueLogo = await sharp({
    create: { width:120, height:120, channels:4, background:{ r:0, g:0, b:0, alpha:1 } },
  }).composite([{ input:Buffer.from('<svg width="120" height="120"><circle cx="60" cy="60" r="34" fill="#D9AD3B"/></svg>') }]).png().toBuffer();
  const clean = await prepareLogoOverlay(opaqueLogo);
  const { data, info } = await sharp(clean).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  assert.ok(info.width < 100 && info.height < 100);
  assert.equal(data[3], 0);
});

test("le contrôle final fait confiance au logo exact composé par le serveur et bloque encore l'OCR", () => {
  assert.match(index, /officialLogoConformity="exact"/);
  assert.match(index, /overlay\.rawOverlayDetected=overlay\.expectedTextExact!==true/);
  assert.match(index, /3\.2\.0-safe-compositor/);
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
  assert.match(index, /"Story": "1088x1920"/);
  assert.match(index, /"Instagram": "1088x1360"/);
  assert.match(index, /"Article Blog Wix": "1920x1088"/);
});
