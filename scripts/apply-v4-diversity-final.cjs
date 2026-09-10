'use strict';
const fs=require('node:fs');
function mustReplace(source,oldValue,newValue,label){
  if(!source.includes(oldValue))throw new Error('Missing marker: '+label);
  return source.replace(oldValue,newValue);
}

// Art worlds: new creativeSeed rotates; same creativeSeed preserves campaign continuity.
let p='netlify/functions/_shared/v3-art-worlds.js';
let s=fs.readFileSync(p,'utf8');
const selectorStart=s.indexOf('function selectArtDirection(');
const fingerprintStart=s.indexOf('function makeArtFingerprint(',selectorStart);
if(selectorStart<0||fingerprintStart<0)throw new Error('Missing art-world selector markers');
const newSelector=[
'function selectArtDirection({compatibleArtWorlds=ART_WORLDS,history=[],seed="viewfinder",antiRepetitionWindow=10,artDirectionKey}={}){',
' const recent=history.slice(-Math.max(10,antiRepetitionWindow)),hash=hashSeed(seed),recentLocations=new Set(recent.map(x=>recentValue(x,"locationFamily")).filter(Boolean)),recentVariants=new Set(recent.map(x=>recentValue(x,"narrativeSignature","narrativeVariant")).filter(Boolean));',
' const entries=Object.entries(LOCATIONS),eligible=entries.filter(([,scene])=>compatibleArtWorlds.includes(scene.artWorldFamily)),usable=eligible.length?eligible:entries,requested=artDirectionKey&&LOCATIONS[artDirectionKey]?[artDirectionKey,LOCATIONS[artDirectionKey]]:null;',
' const sameCampaign=[...recent].reverse().find(entry=>entry&&entry.creativeSeed&&String(entry.creativeSeed)===String(seed));',
' let campaignScene=null;',
' if(sameCampaign){',
'  if(sameCampaign.sceneKey&&LOCATIONS[sameCampaign.sceneKey])campaignScene=[sameCampaign.sceneKey,LOCATIONS[sameCampaign.sceneKey]];',
'  else if(sameCampaign.locationFamily)campaignScene=entries.find(([,scene])=>scene.locationFamily===sameCampaign.locationFamily)||null;',
' }',
' let locationEntry=requested||campaignScene;',
' if(!locationEntry){',
'  const unused=usable.filter(([,scene])=>!recentLocations.has(scene.locationFamily)),pool=unused.length?unused:usable;',
'  locationEntry=pool[hash%pool.length];',
' }',
' const [sceneKey,location]=locationEntry;',
' const historicalVariant=sameCampaign&&(campaignScene?.[0]===sceneKey||sameCampaign.locationFamily===location.locationFamily)?recentValue(sameCampaign,"narrativeSignature","narrativeVariant"):null;',
' const narrativeVariant=historicalVariant||selectUnused(VARIANTS,recentVariants,(hash>>>3)+recent.length*17),recentLocationExclusions=Array.from(recentLocations).slice(-6);',
' const symbolicAmplifiers=[location.fantasticPhenomenon,"empreinte SDZ périphérique discrète"],campaignContinuity=Boolean(sameCampaign&&(campaignScene?.[0]===sceneKey||sameCampaign.locationFamily===location.locationFamily));',
' const differentiationReason=campaignContinuity?`continuité de campagne ${seed} : ${location.locationFamily}; ${narrativeVariant}; caméra ${location.focalLength}, ${location.cameraAngle}`:`${location.locationFamily}; ${narrativeVariant}; caméra ${location.focalLength}, ${location.cameraAngle}; lumière et matières propres à ce monde, distinctes des créations récentes`;',
' return {...location,sceneKey,creativeSeed:seed,campaignContinuity,artWorldFamily:location.artWorldFamily,artWorld:location.artWorldFamily,narrativeVariant,architectureType:location.architectureDescription,primarySymbol:symbolicAmplifiers[0],secondarySymbol:symbolicAmplifiers[1],lightType:location.lightingNarrative,composition:location.cinematicTreatment,realityAnchors:["sujet immédiatement lisible","posture et matières plausibles","profondeur photographique réelle"],symbolicAmplifiers,recentHistoryExclusions:recent.map(fingerprint),recentLocationExclusions,differentiationReason,reasonForDifference:differentiationReason,absoluteExclusions:ABSOLUTE_EXCLUSIONS,antiRepetitionElements:ANTI_REPETITION_ELEMENTS};',
'}',''
].join('\n');
s=s.slice(0,selectorStart)+newSelector+s.slice(fingerprintStart);
s=mustReplace(s,
'function makeArtFingerprint({service,platform,layout,selection,artDirection,status="generated"}){return {createdAt:Date.now(),status,service,platform,artWorld:selection.artWorldFamily,artWorldFamily:selection.artWorldFamily,sceneKey:selection.sceneKey,locationFamily:selection.locationFamily,',
'function makeArtFingerprint({service,platform,layout,selection,artDirection,creativeSeed,status="generated"}){return {createdAt:Date.now(),status,service,platform,creativeSeed:creativeSeed||artDirection?.creativeSeed||selection?.creativeSeed||null,artWorld:selection.artWorldFamily,artWorldFamily:selection.artWorldFamily,sceneKey:selection.sceneKey,locationFamily:selection.locationFamily,',
'creativeSeed fingerprint');
fs.writeFileSync(p,s);

// Art direction: selected world camera geometry must be the real camera geometry.
p='netlify/functions/_shared/v3-art-direction.js';
s=fs.readFileSync(p,'utf8');
s=mustReplace(s,
'focalLength:composite?"50 mm":["35 mm","50 mm","85 mm"][artHistory.length%3],cameraDistance:"plan moyen éditorial permettant de lire tous les plans",cameraHeight:["naturelle du geste","légère plongée","légère contre-plongée"][artHistory.length%3],cameraAngle:"trois-quarts naturel",',
'focalLength:composite?"50 mm":(selectedArt.focalLength||["35 mm","50 mm","85 mm"][artHistory.length%3]),cameraDistance:composite?"plan moyen éditorial permettant de lire tous les plans":(selectedArt.cameraDistance||"plan moyen éditorial permettant de lire tous les plans"),cameraHeight:composite?"naturelle du geste":(selectedArt.cameraHeight||["naturelle du geste","légère plongée","légère contre-plongée"][artHistory.length%3]),cameraAngle:composite?"trois-quarts naturel":(selectedArt.cameraAngle||"trois-quarts naturel"),',
'camera variation propagation');
fs.writeFileSync(p,s);

// Pipeline fingerprint stores creativeSeed.
p='netlify/functions/_shared/v3-pipeline.js';
s=fs.readFileSync(p,'utf8');
s=mustReplace(s,
'function artisticFingerprint(plan,finalization,status){return makeArtFingerprint({service:plan.contract.name,platform:plan.artDirection.platform,layout:finalization?.layout,selection:plan.artSelection,artDirection:plan.artDirection,status});}',
'function artisticFingerprint(plan,finalization,status){return makeArtFingerprint({service:plan.contract.name,platform:plan.artDirection.platform,layout:finalization?.layout,selection:plan.artSelection,artDirection:plan.artDirection,creativeSeed:plan.artDirection.creativeSeed,status});}',
'pipeline fingerprint seed');
fs.writeFileSync(p,s);

// SceneIntent: selected location/camera/light/materials reach the canonical provider prompt.
p='netlify/functions/_shared/v3-scene-intent.js';
s=fs.readFileSync(p,'utf8');
s=mustReplace(s,'const VERSION="4.4.0-scene-intent";','const VERSION="4.5.0-scene-intent-diversity";','SceneIntent version');
const helper=[
'',
'function visualVariationDirective(artDirection={}){',
' const art=artDirection?.artistic||{};',
' const axes=[',
'  art.locationFamily&&`lieu : ${art.locationFamily}`,',
'  art.narrativeVariant&&`mise en scène : ${art.narrativeVariant}`,',
'  art.cinematicTreatment&&`perspective : ${art.cinematicTreatment}`,',
'  art.focalLength&&`focale : ${art.focalLength}`,',
'  art.cameraAngle&&`angle : ${art.cameraAngle}`,',
'  art.cameraHeight&&`hauteur : ${art.cameraHeight}`,',
'  art.cameraDistance&&`distance : ${art.cameraDistance}`,',
'  art.lightingNarrative&&`lumière : ${art.lightingNarrative}`,',
'  Array.isArray(art.dominantMaterials)&&art.dominantMaterials.length&&`matières : ${art.dominantMaterials.join(", ")}`,',
' ].filter(Boolean);',
' const continuity=art.campaignContinuity?" Cette combinaison appartient à la même campagne : conserver son monde visuel entre les formats.":" Cette combinaison est choisie pour différencier cette création des précédentes : la respecter réellement, sans la remplacer par un décor générique déjà vu.";',
' return axes.length?`VARIATION VISUELLE IMPOSÉE — ${axes.join(" ; ")}.${continuity}`:"";',
'}',''
].join('\n');
s=mustReplace(s,'\nfunction environmentFor({subjectBrief,artDirection,registers,platform}){',helper+'\nfunction environmentFor({subjectBrief,artDirection,registers,platform}){','variation helper');
s=mustReplace(s,
' const authority=subjectBrief.spatialAuthority?.description||subjectBrief.explicitSceneRequest?.description||null,exact=clean(subjectBrief.exactUserRequest||""),art=artDirection?.artistic||{};',
' const authority=subjectBrief.spatialAuthority?.description||subjectBrief.explicitSceneRequest?.description||null,exact=clean(subjectBrief.exactUserRequest||""),art=artDirection?.artistic||{},variation=visualVariationDirective(artDirection);',
'variation variable');
s=mustReplace(s,
'  return `Le décor décrit dans DEMANDE EXACTE gouverne la scène. ${safe&&safe!=="le sujet demandé"?safe:fallback&&fallback!=="le sujet demandé"?fallback:"Respecter strictement ses éléments spatiaux, son ouverture et sa profondeur."}`;',
'  return `Le décor décrit dans DEMANDE EXACTE gouverne la scène. ${safe&&safe!=="le sujet demandé"?safe:fallback&&fallback!=="le sujet demandé"?fallback:"Respecter strictement ses éléments spatiaux, son ouverture et sa profondeur."}${variation?` ${variation}`:""}`;',
'explicit authority variation');
s=mustReplace(s,
' if(normalizePlatform(platform)==="Google Business")return "Lieu crédible, simple et premium, immédiatement lisible, sans effet spectaculaire qui ferait croire à un faux cabinet.";',
' if(normalizePlatform(platform)==="Google Business")return `Lieu crédible, simple et premium, immédiatement lisible, sans effet spectaculaire qui ferait croire à un faux cabinet.${variation?` ${variation}`:""}`;',
'Google variation');
s=mustReplace(s,
' if(!pieces.length)pieces.push("Environnement SDZ réel ou métaphorique, noir profond et matières sombres détaillées, jamais cabine de spa générique.");\n return pieces.join(" ");',
' if(!pieces.length)pieces.push("Environnement SDZ réel ou métaphorique, noir profond et matières sombres détaillées, jamais cabine de spa générique.");\n if(variation)pieces.push(variation);\n return pieces.join(" ");',
'general variation');
fs.writeFileSync(p,s);

// Historical regressions: selected world must reach provider; explicit user selection stays authoritative.
p='tests/v3-stabilization.test.js';
s=fs.readFileSync(p,'utf8');
s=mustReplace(s,
'test("24 univers pilotés par historique évitent la répétition immédiate sans bannir l\'architecture",()=>{assert.equal(ART_WORLDS.length,24);const first=selectArtDirection({seed:"a"});const second=selectArtDirection({seed:"a",history:[{artWorld:first.artWorld,architectureType:first.architectureType,primarySymbol:first.primarySymbol}]});assert.notEqual(second.artWorld,first.artWorld);assert.match(second.reasonForDifference,/différent/i);assert.ok(ART_WORLDS.some(x=>/Arcade|Architecture/i.test(x)));});',
'test("24 univers et historique évitent la répétition entre créations sans casser une campagne",()=>{assert.equal(ART_WORLDS.length,24);const first=selectArtDirection({seed:"creation-a"});const history=[{creativeSeed:"creation-a",sceneKey:first.sceneKey,locationFamily:first.locationFamily,artWorld:first.artWorld,narrativeSignature:first.narrativeVariant}];const same=selectArtDirection({seed:"creation-a",history});assert.equal(same.locationFamily,first.locationFamily);assert.equal(same.narrativeVariant,first.narrativeVariant);const second=selectArtDirection({seed:"creation-b",history});assert.notEqual(second.locationFamily,first.locationFamily);assert.match(second.reasonForDifference,/distinctes des créations récentes/i);assert.ok(ART_WORLDS.some(x=>/Arcade|Architecture/i.test(x)));});',
'historical repetition semantics');
s=mustReplace(s,'assert.doesNotMatch(p,/UNIVERS ARTISTIQUE SÉLECTIONNÉ|pavillon lacustre ouvert/i);','assert.match(p,/pavillon lacustre ouvert/i);assert.match(p,/VARIATION VISUELLE IMPOSÉE/i);','selected world provider regression');
s=mustReplace(s,'assert.doesNotMatch(plan.photoBrief.prompt,new RegExp(plan.artSelection.locationFamily,"i"));','assert.match(plan.photoBrief.prompt,new RegExp(plan.artSelection.locationFamily,"i"));','campaign provider world regression');
s=mustReplace(s,
'const excluded=selectArtDirection({seed:"arcade",artDirectionKey:"arcade_obsidienne",history:[{locationFamily:"galerie d’obsidienne asymétrique",artWorld:"Arcade monumentale",architectureType:"arcade d’obsidienne latérale"}]});assert.notEqual(excluded.locationFamily,allowed.locationFamily);',
'const explicitAgain=selectArtDirection({seed:"arcade-2",artDirectionKey:"arcade_obsidienne",history:[{locationFamily:"galerie d’obsidienne asymétrique",artWorld:"Arcade monumentale",architectureType:"arcade d’obsidienne latérale"}]});assert.equal(explicitAgain.locationFamily,allowed.locationFamily);',
'explicit art direction authority');
fs.writeFileSync(p,s);

console.log('V4 campaign-aware diversity patch applied');
