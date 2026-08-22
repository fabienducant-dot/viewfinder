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
  }
});

test("le compositor et la recomposition sont importables dans un runtime serveur",()=>{
  assert.doesNotThrow(()=>require("../netlify/functions/_shared/brand-compositor"));
  assert.doesNotThrow(()=>require("../netlify/functions/recompose-image-job"));
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
