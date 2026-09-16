"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {planV3}=require('../netlify/functions/_shared/v3-pipeline');
const {SERVICE_REGISTRY}=require('../netlify/functions/_shared/v3-registry');
const {PLATFORM_TEMPLATES}=require('../netlify/functions/_shared/v3-layout-engine');
const {explicitDemonstrationRequested}=require('../netlify/functions/_shared/v3-scene-intent');
const subject=fs.readFileSync(path.join(__dirname,'fixtures/sdz-real-dorsal-request.txt'),'utf8');
const exact=subject.replace(/\s+/g,' ').trim();
test('le texte réel communiqué à Fabien prépare 133 variantes sans perte de demande',()=>{
 let count=0;
 for(const service of [...Object.keys(SERVICE_REGISTRY),'Tous sujets'])for(const platform of Object.keys(PLATFORM_TEMPLATES)){
  const p=planV3({service,platform,subject,selectedRegisters:['Fantastique','Architecture','Cinématographie'],creativeSeed:'real-user-regression'});
  assert.equal(p.consistencyReport.sceneIntentAudit.ok,true,`${service}/${platform}`);
  assert.ok(p.photoBrief.prompt.length<=4800,`${service}/${platform}`);
  assert.equal(p.photoBrief.prompt.split(exact).length-1,1);
  assert.match(p.photoBrief.prompt,/EXPOSITION LUMINEUSE/);assert.match(p.photoBrief.prompt,/OR ABONDANT/);
  assert.match(p.photoBrief.prompt,/Aucun texte, aucune lettre, aucun logo/);
  assert.doesNotMatch(p.sceneIntent.environment,/lieu : galerie suspendue|VARIATION VISUELLE IMPOSÉE/);
  if(service==='Massage dos/zone'&&platform==='Story')assert.equal(p.sceneIntent.mode,'narrative_consequence');
  if(p.sceneIntent.mode==='product_fidelity')assert.match(p.photoBrief.prompt,/FIDÉLITÉ PRODUIT|PREUVE RÉELLE/);
  if(p.sceneIntent.mode==='composite_fidelity')for(const stage of p.contract.requiredCompositeStages)assert.ok(p.photoBrief.prompt.includes(stage));
  count++;
 }
 assert.equal(count,133);
});
test('la négation ne demande jamais une démonstration mais une demande positive la conserve',()=>{
 for(const request of ['sans illustrer une séance de massage','Ne pas montrer une séance de massage.','Pas de table de massage ; montrer la libération.','Aucune séance de massage.'])assert.equal(explicitDemonstrationRequested({exactUserRequest:request}),false,request);
 for(const request of ['Montrer une séance de massage.','Sans décor fantastique, mais montrer le geste de massage.'])assert.equal(explicitDemonstrationRequested({exactUserRequest:request}),true,request);
});
