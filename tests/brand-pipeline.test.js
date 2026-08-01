"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { applyImageEditOptions, normalizeImageModel } = require("../netlify/functions/_shared/openai-image-edit-options");
const { composeBrandPoster } = require("../netlify/functions/_shared/brand-compositor");

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
  assert.match(index, /quality: "high"/);
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
  assert.equal(meta.width, 1088);
  assert.equal(meta.height, 1920);
  assert.ok(finalBuffer.length > 20_000);
});

test("les formats gpt-image-2 suivent les ratios de publication", () => {
  assert.match(index, /"Story": "1088x1920"/);
  assert.match(index, /"Instagram": "1088x1360"/);
  assert.match(index, /"Article Blog Wix": "1920x1088"/);
});
