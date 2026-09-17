"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {planV3}=require('../netlify/functions/_shared/v3-pipeline');
const {SERVICE_REGISTRY}=require('../netlify/functions/_shared/v3-registry');
const {PLATFORM_TEMPLATES}=require('../netlify/functions/_shared/v3-layout-engine');
const {assessQuality}=require('../netlify/functions/_shared/v3-quality');
const {ANALYSIS_SCHEMA}=require('../netlify/functions/_shared/v3-image-analyzer');
const {signatureForPlatform,signatureGeometry}=require('../netlify/functions/_shared/brand-compositor');

test('19 sujets × 7 formats transmettent la lumière, l’or et le fantastique au fournisseur',()=>{
 let count=0;
 for(const service of [...Object.keys(SERVICE_REGISTRY),'Tous sujets'])for(const platform of Object.keys(PLATFORM_TEMPLATES)){
  const p=planV3({service,platform,subject:'Douleurs dorsales, blocage, sensations de lourdeur',creativeSeed:'luminous-default',selectedRegisters:[]});
  assert.equal(p.photoBrief.prompt,p.sceneIntent.providerPrompt);
  assert.match(p.photoBrief.prompt,/EXPOSITION LUMINEUSE/);
  assert.match(p.photoBrief.prompt,/OR ABONDANT/);
  assert.equal(p.sceneIntent.validation.requireFantastic,true);
  assert.equal(p.sceneIntent.validation.requireLuminousGold,true);
  assert.doesNotMatch(p.photoBrief.prompt,/presque imperceptible|or discret|or satiné discret|fantastique.*subtil|micro-lueur/);
  assert.ok(p.photoBrief.prompt.length<=4800,`${service}/${platform}`);
  assert.equal(p.consistencyReport.ready,true);
  count++;
 }
 assert.equal(count,133);
});

test('une demande documentaire explicite reste prioritaire sur le fantastique par défaut',()=>{
 const p=planV3({service:'Massage Zébré',platform:'Facebook',subject:'Montrer le geste de massage, photo documentaire sans fantastique',selectedRegisters:[]});
 assert.equal(p.sceneIntent.mode,'demonstration');
 assert.equal(p.sceneIntent.registers.fantastic,false);
 assert.equal(p.sceneIntent.validation.requireFantastic,false);
 assert.doesNotMatch(p.photoBrief.prompt,/féerie spectaculaire|en lévitation|vastes terrasses flottantes/);
 assert.match(p.photoBrief.prompt,/PREUVE MÉTIER/);
});

test('une image sombre et pauvre en or ne peut plus être validée par le contraste global',()=>{
 const contract=SERVICE_REGISTRY['Massage Zébré'];
 const quality=assessQuality({contract,sceneIntent:{mode:'narrative_consequence',validation:{requireLuminousGold:true}},analysis:{exposureReadable:false,goldPresence:.12,availableContrast:.9},composition:{imageExists:true}});
 assert.equal(quality.ok,false);
 assert.ok(quality.artistic.errors.includes('scene_trop_sombre'));
 assert.ok(quality.artistic.errors.includes('or_insuffisant_dans_la_scene'));
 const good=assessQuality({contract,sceneIntent:{mode:'narrative_consequence',validation:{requireLuminousGold:true}},analysis:{exposureReadable:true,goldPresence:.65,availableContrast:.8},composition:{imageExists:true}});
 assert.equal(good.ok,true);
 const old=assessQuality({contract,sceneIntent:{mode:'narrative_consequence',validation:{requireLuminousGold:true}},analysis:{},composition:{imageExists:true}});
 assert.ok(old.warnings.includes('lumiere_et_or_non_evalues_ancienne_analyse'));
 for(const field of ['exposureReadable','goldPresence'])assert.ok(ANALYSIS_SCHEMA.schema.required.includes(field));
});

test('signature identique sur les sept plateformes : nom or, RAISMES espacé entre deux filets',()=>{
 for(const platform of Object.keys(PLATFORM_TEMPLATES)){
  const s=signatureForPlatform(platform);
  assert.equal(s.name,'LA SANTÉ DES ZÈBRES');assert.equal(s.location,'RAISMES');assert.equal(s.nameFont,'display');
  const g=signatureGeometry({...s,brandSize:34,citySize:19,cityBaseline:300});
  assert.ok(g.cityTracking>0);
  assert.ok(g.ruleOuter>g.cityWidth/2+g.ruleGap);
  assert.ok(g.ruleOuter*2<g.nameWidth);
 }
});
