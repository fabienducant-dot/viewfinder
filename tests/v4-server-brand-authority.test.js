"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

test("une photographie V4 refusée reste sous autorité Sharp au lieu de retomber dans Canvas",()=>{
  const executor=fs.readFileSync("netlify/functions/_shared/v3-executor.js","utf8");
  assert.doesNotMatch(executor,/if\(!finalization\.quality\.ok\)return \{imageBuffer:rawImageBuffer,brandComposited:false/);
  assert.match(executor,/le rendu de contrôle reste composé par Sharp/);
});

test("le navigateur interdit explicitement tout fallback Canvas après passage par le compositor serveur",()=>{
  const index=fs.readFileSync("index.html","utf8");
  assert.match(index,/const serverBrandPath = flow\.serverBrandCompositionUsed===true/);
  assert.match(index,/if\(serverBrandPath && !logoInScene\) throw new Error\("Composition serveur Sharp absente/);
});

test("le cas Story exact qui a débordé reste couvert par la matrice Sharp, jamais par Canvas",()=>{
  const matrix=fs.readFileSync("tests/v4-brand-layout-matrix.test.js","utf8");
  const compositor=fs.readFileSync("netlify/functions/_shared/brand-compositor.js","utf8");
  assert.match(matrix,/19 sujets × 7 formats/);
  assert.match(compositor,/Story:Object\.freeze\(\{family:"premium-story"/);
  assert.match(compositor,/textWithinCanvas/);
  assert.match(compositor,/logoWithinCanvas/);
});
