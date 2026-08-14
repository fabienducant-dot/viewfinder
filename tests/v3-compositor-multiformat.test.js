"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const os=require("node:os");
const sharp=require("sharp");
const {composeBrandPoster,BRAND_TOKENS,prepareLogoOverlay,hasOpaqueLogoRectangle}=require("../netlify/functions/_shared/brand-compositor");
const {PLATFORM_TEMPLATES}=require("../netlify/functions/_shared/v3-layout-engine");

const logoFile=fs.readFileSync(path.join(__dirname,"../icons/icon-512.png"));
const logoDataUrl=`data:image/png;base64,${logoFile.toString("base64")}`;
const strategy={title:"DÉCOUVRIR L’UNIVERS SDZ",subtitle:"UNE ATMOSPHÈRE SINGULIÈRE",titleLines:["DÉCOUVRIR L’UNIVERS","SDZ"],subtitleLines:["UNE ATMOSPHÈRE SINGULIÈRE"],textMode:"TEXT_MODE_EDITORIAL",safeAreasByFormat:Object.fromEntries(Object.entries(BRAND_TOKENS.compositionSafeAreas).map(([name,areas])=>[name,{text:{...areas.text},logo:{...areas.logo}}])),logoScale:"prominent",brandLine:""};
const variants=["Editorial","Cinematic","Minimalist"];
function inside(inner,outer){return inner.left>=outer.left&&inner.top>=outer.top&&inner.right<=outer.right&&inner.bottom<=outer.bottom;}

test("les 7 formats × 3 variantes suivent exclusivement PosterStrategy et restent dans leurs zones",async()=>{
 const raw=await sharp({create:{width:1600,height:2000,channels:3,background:"#181511"}}).png().toBuffer();
 const renderDirectory=fs.mkdtempSync(path.join(os.tmpdir(),"viewfinder-sharp-"));
 try{for(const [platform,template] of Object.entries(PLATFORM_TEMPLATES)){
  const variantRenders=[];
  for(const family of variants){
   const output=await composeBrandPoster({imageBuffer:raw,logoDataUrl,platform,headline:"ANCIEN HEADLINE V2 À IGNORER",posterStrategy:strategy,selectedLayout:{family,template}}),manifest=output.compositionManifest,meta=await sharp(output).metadata();
   assert.deepEqual([meta.width,meta.height],[template.width,template.height],`${platform}/${family}: dimensions`);
   assert.equal(manifest.title,strategy.title);assert.equal(manifest.subtitle,strategy.subtitle);assert.deepEqual(manifest.titleLines,strategy.titleLines);assert.deepEqual(manifest.subtitleLines,strategy.subtitleLines);
   assert.ok(inside(manifest.boxes.title,manifest.safeAreas.text));assert.ok(inside(manifest.boxes.subtitle,manifest.safeAreas.text));assert.ok(inside(manifest.boxes.logo,manifest.safeAreas.logo));
   assert.equal(manifest.checks.titleSubtitleCollision,false);assert.equal(manifest.checks.textLogoCollision,false);assert.equal(manifest.checks.canvasOverflow,false);assert.equal(manifest.checks.opaqueLogoRectangle,false);
   assert.equal(manifest.logo.fit,"contain");assert.equal(manifest.logo.fullyVisible,true);assert.ok(Math.abs(manifest.logo.sourceRatio-manifest.logo.renderedRatio)<.02,"ratio du logo");
   assert.equal(manifest.svg.titleColor,BRAND_TOKENS.brandGold);assert.equal(manifest.imageGenerationCallCount,0);variantRenders.push(crypto.createHash("sha256").update(output).digest("hex"));
   fs.writeFileSync(path.join(renderDirectory,`${platform}-${family}.png`.replace(/[^a-z0-9.-]+/gi,"-")),output);
  }
  assert.equal(new Set(variantRenders).size,3,`${platform}: variantes Sharp distinctes`);
 }
 assert.equal(fs.readdirSync(renderDirectory).filter(file=>file.endsWith(".png")).length,21);
 }finally{fs.rmSync(renderDirectory,{recursive:true,force:true});}
});

test("le vrai asset conserve ses noirs internes sans rectangle extérieur opaque",async()=>{const clean=await prepareLogoOverlay(logoFile);assert.equal(await hasOpaqueLogoRectangle(clean),false);const meta=await sharp(clean).metadata();assert.equal(meta.hasAlpha,true);});
