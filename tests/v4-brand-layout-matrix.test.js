"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const sharp=require("sharp");
const {SERVICE_REGISTRY,GENERIC_SUBJECT_CONTRACT}=require("../netlify/functions/_shared/v3-registry");
const {PLATFORM_TEMPLATES}=require("../netlify/functions/_shared/v3-layout-engine");
const {composeBrandPoster}=require("../netlify/functions/_shared/brand-compositor");
const {resolveTypographyLayout,POLICIES,VERSION}=require("../netlify/functions/_shared/v4-brand-layout");

const services=[...Object.values(SERVICE_REGISTRY),GENERIC_SUBJECT_CONTRACT];
const platforms=Object.keys(PLATFORM_TEMPLATES);
const stressSubtitle="DOULEURS DORSALES, BLOCAGE, SENSATIONS DE LOURDEUR";
const extremeSubtitle="BESOIN DE SOUFFLER, DE DÉCHARGER LES TENSIONS MENTALES ET PHYSIQUES, DE RETROUVER DE L’ESPACE ET DE LA LÉGÈRETÉ";
const measure=(text,size)=>String(text).length*size*.58;

test("le moteur typographique V4 conserve le texte exact et borne toutes les lignes",()=>{
  assert.equal(VERSION,"4.1.0-matrix-safe-typography");
  for(const platform of platforms){
    const policy=POLICIES[platform];assert.ok(policy,platform);
    for(const c of services){
      const title=c.name.toUpperCase(),subtitle=stressSubtitle;
      const t=resolveTypographyLayout({platform,title,subtitle,textMode:platform==="Google Business"?"TEXT_MODE_MINIMAL":"TEXT_MODE_EDITORIAL",safeWidth:platform==="Bannière"?820:platform==="Blog"?760:900,safeHeight:platform==="Bannière"?180:230,scale:1,measureTitle:measure,measureSubtitle:measure});
      assert.equal(t.titleLines.join(" "),title,`${platform}/${c.name}/title`);
      assert.ok(t.titleLines.length<=policy.titleMaxLines,`${platform}/${c.name}/title lines`);
      assert.ok(t.subtitleLines.length<=policy.subtitleMaxLines,`${platform}/${c.name}/subtitle lines`);
      assert.ok(t.usedHeight<=t.safeHeight,`${platform}/${c.name}/height`);
      assert.ok(t.titleLines.every(line=>measure(line,t.titleSize)<=t.safeWidth),`${platform}/${c.name}/title width`);
      assert.ok(t.subtitleLines.every(line=>measure(line,t.subtitleSize)<=t.safeWidth),`${platform}/${c.name}/subtitle width`);
    }
  }
});

test("matrice Sharp complète 19 sujets × 7 formats : aucun texte, logo ou signature hors cadre",async()=>{
  const source=await sharp({create:{width:1024,height:1024,channels:4,background:{r:31,g:31,b:31,alpha:1}}}).png().toBuffer();
  let count=0;
  for(const platform of platforms){
    const template=PLATFORM_TEMPLATES[platform],policy=POLICIES[platform];
    for(const c of services){
      const title=c.name.toUpperCase(),subtitle=platform==="Google Business"?"":stressSubtitle;
      const posterStrategy={textMode:platform==="Google Business"?"TEXT_MODE_NONE":"TEXT_MODE_EDITORIAL",title,subtitle,titleLines:[title],subtitleLines:subtitle?[subtitle]:[],logoScale:"prominent"};
      const output=await composeBrandPoster({imageBuffer:source,platform,posterStrategy});
      const meta=await sharp(output).metadata(),m=output.compositionManifest;
      assert.deepEqual([meta.width,meta.height],[template.width,template.height],`${platform}/${c.name}/dimensions`);
      for(const key of ["titleExact","subtitleExact","textWithinCanvas","marginsValid","zonesDisjoint","logoWithinCanvas","logoAssetIntegrity","logoScaleValid"])assert.equal(m[key],true,`${platform}/${c.name}/${key}`);
      assert.equal(m.typographyEngineVersion,VERSION,`${platform}/${c.name}/engine`);
      assert.ok(m.titleLines.length<=policy.titleMaxLines,`${platform}/${c.name}/title lines`);
      assert.ok(m.subtitleLines.length<=policy.subtitleMaxLines,`${platform}/${c.name}/subtitle lines`);
      assert.ok(m.titleWidths.every(width=>width<=m.safeWidth),`${platform}/${c.name}/title widths`);
      assert.ok(m.subtitleWidths.every(width=>width<=m.safeWidth),`${platform}/${c.name}/subtitle widths`);
      assert.ok(m.usedHeight<=m.safeHeight,`${platform}/${c.name}/text height`);
      assert.ok(m.brandLockup.bottom<=m.height-m.brandLockup.minimumBottomMargin,`${platform}/${c.name}/brand bottom`);
      assert.ok(m.logoBounds.left>=0&&m.logoBounds.right<=m.width&&m.logoBounds.top>=0&&m.logoBounds.bottom<=m.height,`${platform}/${c.name}/logo bounds`);
      count++;
    }
  }
  assert.equal(count,services.length*platforms.length);assert.equal(count,133);
});

test("stress texte long sur chaque format : réduction contrôlée, jamais de clipping",async()=>{
  const source=await sharp({create:{width:1024,height:1024,channels:4,background:{r:18,g:18,b:18,alpha:1}}}).png().toBuffer();
  for(const platform of platforms){
    const posterStrategy={textMode:platform==="Google Business"?"TEXT_MODE_MINIMAL":"TEXT_MODE_EDITORIAL",title:"RÉFLEXOLOGIE PLANTAIRE THAÏLANDAISE",subtitle:platform==="Google Business"?"":extremeSubtitle,titleLines:["RÉFLEXOLOGIE PLANTAIRE THAÏLANDAISE"],subtitleLines:[extremeSubtitle],logoScale:"prominent"};
    const output=await composeBrandPoster({imageBuffer:source,platform,posterStrategy}),m=output.compositionManifest;
    assert.equal(m.textWithinCanvas,true,platform);assert.equal(m.titleExact,true,platform);assert.equal(m.subtitleExact,true,platform);
    assert.ok(m.titleLines.length<=POLICIES[platform].titleMaxLines,platform);assert.ok(m.subtitleLines.length<=POLICIES[platform].subtitleMaxLines,platform);
    assert.ok(m.titleWidths.every(width=>width<=m.safeWidth),platform);assert.ok(m.subtitleWidths.every(width=>width<=m.safeWidth),platform);assert.ok(m.usedHeight<=m.safeHeight,platform);
    assert.ok(m.brandLockup.bottom<=m.height-m.brandLockup.minimumBottomMargin,platform);
  }
});
