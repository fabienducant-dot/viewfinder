"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const sharp=require("sharp");
const {composeBrandPoster}=require("../netlify/functions/_shared/brand-compositor");

function solidPng(width,height){return sharp({create:{width,height,channels:3,background:{r:20,g:20,b:20}}}).png().toBuffer();}

test("une photographie V4 refusée reste sous autorité Sharp au lieu de retomber dans Canvas",()=>{
  const executor=fs.readFileSync("netlify/functions/_shared/v3-executor.js","utf8");
  assert.doesNotMatch(executor,/if\(!finalization\.quality\.ok\)return \{imageBuffer:rawImageBuffer,brandComposited:false/);
  assert.match(executor,/V4_ANALYSIS_FAILED/);
  assert.match(executor,/V4_SHARP_COMPOSITION_FAILED/);
  assert.match(executor,/finalCompositionEngine:"sharp-server"/);
});

test("le navigateur interdit explicitement tout fallback Canvas après passage par le compositor serveur",()=>{
  const index=fs.readFileSync("index.html","utf8");
  assert.match(index,/const serverBrandPath = flow\.serverBrandCompositionUsed===true/);
  assert.match(index,/finalCompositionEngine!=="sharp-server"/);
  assert.match(index,/aucun fallback Canvas n’est autorisé/);
});

test("le cas Story exact qui a débordé reste couvert par la matrice Sharp, jamais par Canvas",()=>{
  const matrix=fs.readFileSync("tests/v4-brand-layout-matrix.test.js","utf8");
  const compositor=fs.readFileSync("netlify/functions/_shared/brand-compositor.js","utf8");
  assert.match(matrix,/19 sujets × 7 formats/);
  assert.match(compositor,/Story:Object\.freeze\(\{family:"premium-story"/);
  assert.match(compositor,/textWithinCanvas/);
  assert.match(compositor,/logoWithinCanvas/);
});

test("régression du visuel réel : MASSAGE DOS ZONE et douleurs dorsales restent intégralement dans le cadre Story",async()=>{
  const imageBuffer=await solidPng(1080,1920);
  const output=await composeBrandPoster({
    imageBuffer,
    platform:"Story",
    headline:"MASSAGE DOS/ZONE | DOULEURS DORSALES, BLOCAGE, SENSATIONS DE LOURDEUR",
    zoneText:"",
    posterStrategy:{title:"MASSAGE DOS/ZONE",subtitle:"DOULEURS DORSALES, BLOCAGE, SENSATIONS DE LOURDEUR"}
  });
  const manifest=output.compositionManifest||{};
  assert.equal(manifest.textWithinCanvas,true,JSON.stringify(manifest));
  assert.equal(manifest.logoWithinCanvas,true,JSON.stringify(manifest));
  assert.equal(manifest.marginsValid,true,JSON.stringify(manifest));
  assert.equal(manifest.zonesDisjoint,true,JSON.stringify(manifest));
  assert.equal(manifest.logoRectangleOpaque,false,JSON.stringify(manifest));
  assert.equal(manifest.finalCompositionEngine,"sharp-server");
  const meta=await sharp(output).metadata();
  assert.equal(meta.width,1080);
  assert.equal(meta.height,1920);
});
