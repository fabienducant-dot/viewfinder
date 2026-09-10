'use strict';
const fs=require('node:fs');
function mustReplace(source,oldValue,newValue,label){if(!source.includes(oldValue))throw new Error(`Missing marker: ${label}`);return source.replace(oldValue,newValue);}

let p='netlify/functions/_shared/v3-art-direction.js';
let s=fs.readFileSync(p,'utf8');
s=mustReplace(s,
'focalLength:composite?"50 mm":["35 mm","50 mm","85 mm"][artHistory.length%3],cameraDistance:"plan moyen éditorial permettant de lire tous les plans",cameraHeight:["naturelle du geste","légère plongée","légère contre-plongée"][artHistory.length%3],cameraAngle:"trois-quarts naturel",',
'focalLength:composite?"50 mm":(selectedArt.focalLength||["35 mm","50 mm","85 mm"][artHistory.length%3]),cameraDistance:composite?"plan moyen éditorial permettant de lire tous les plans":(selectedArt.cameraDistance||"plan moyen éditorial permettant de lire tous les plans"),cameraHeight:composite?"naturelle du geste":(selectedArt.cameraHeight||["naturelle du geste","légère plongée","légère contre-plongée"][artHistory.length%3]),cameraAngle:composite?"trois-quarts naturel":(selectedArt.cameraAngle||"trois-quarts naturel"),',
'camera variation propagation');
fs.writeFileSync(p,s);

p='netlify/functions/_shared/v3-scene-intent.js';
s=fs.readFileSync(p,'utf8');
s=mustReplace(s,'const VERSION="4.4.0-scene-intent";','const VERSION="4.5.0-scene-intent-diversity";','SceneIntent version');
const helper=`\nfunction visualVariationDirective(artDirection={}){\n const art=artDirection?.artistic||{};\n const axes=[\n  art.locationFamily&&\`lieu : \${art.locationFamily}\`,\n  art.narrativeVariant&&\`mise en scène : \${art.narrativeVariant}\`,\n  art.cinematicTreatment&&\`perspective : \${art.cinematicTreatment}\`,\n  art.focalLength&&\`focale : \${art.focalLength}\`,\n  art.cameraAngle&&\`angle : \${art.cameraAngle}\`,\n  art.cameraHeight&&\`hauteur : \${art.cameraHeight}\`,\n  art.cameraDistance&&\`distance : \${art.cameraDistance}\`,\n  art.lightingNarrative&&\`lumière : \${art.lightingNarrative}\`,\n  Array.isArray(art.dominantMaterials)&&art.dominantMaterials.length&&\`matières : \${art.dominantMaterials.join(", ")}\`,\n ].filter(Boolean);\n return axes.length?\`VARIATION VISUELLE IMPOSÉE — \${axes.join(" ; ")}. Cette combinaison est choisie pour différencier cette création des précédentes : la respecter réellement, sans la remplacer par un décor générique déjà vu.\`:"";\n}\n`;
s=mustReplace(s,'\nfunction environmentFor({subjectBrief,artDirection,registers,platform}){',helper+'\nfunction environmentFor({subjectBrief,artDirection,registers,platform}){','variation helper insertion');
s=mustReplace(s,
' const authority=subjectBrief.spatialAuthority?.description||subjectBrief.explicitSceneRequest?.description||null,exact=clean(subjectBrief.exactUserRequest||""),art=artDirection?.artistic||{};',
' const authority=subjectBrief.spatialAuthority?.description||subjectBrief.explicitSceneRequest?.description||null,exact=clean(subjectBrief.exactUserRequest||""),art=artDirection?.artistic||{},variation=visualVariationDirective(artDirection);',
'variation variable');
s=mustReplace(s,
'  return `Le décor décrit dans DEMANDE EXACTE gouverne la scène. ${safe&&safe!=="le sujet demandé"?safe:fallback&&fallback!=="le sujet demandé"?fallback:"Respecter strictement ses éléments spatiaux, son ouverture et sa profondeur."}`;',
'  return `Le décor décrit dans DEMANDE EXACTE gouverne la scène. ${safe&&safe!=="le sujet demandé"?safe:fallback&&fallback!=="le sujet demandé"?fallback:"Respecter strictement ses éléments spatiaux, son ouverture et sa profondeur."}${variation?` ${variation}`:""}`;',
'authority variation');
s=mustReplace(s,
' if(normalizePlatform(platform)==="Google Business")return "Lieu crédible, simple et premium, immédiatement lisible, sans effet spectaculaire qui ferait croire à un faux cabinet.";',
' if(normalizePlatform(platform)==="Google Business")return `Lieu crédible, simple et premium, immédiatement lisible, sans effet spectaculaire qui ferait croire à un faux cabinet.${variation?` ${variation}`:""}`;',
'Google variation');
s=mustReplace(s,
' if(!pieces.length)pieces.push("Environnement SDZ réel ou métaphorique, noir profond et matières sombres détaillées, jamais cabine de spa générique.");\n return pieces.join(" ");',
' if(!pieces.length)pieces.push("Environnement SDZ réel ou métaphorique, noir profond et matières sombres détaillées, jamais cabine de spa générique.");\n if(variation)pieces.push(variation);\n return pieces.join(" ");',
'general variation');
fs.writeFileSync(p,s);

p='tests/v3-stabilization.test.js';
s=fs.readFileSync(p,'utf8');
s=mustReplace(s,'assert.doesNotMatch(p,/UNIVERS ARTISTIQUE SÉLECTIONNÉ|pavillon lacustre ouvert/i);','assert.match(p,/pavillon lacustre ouvert/i);assert.match(p,/VARIATION VISUELLE IMPOSÉE/i);','selected world reaches provider prompt');
s=mustReplace(s,'assert.doesNotMatch(plan.photoBrief.prompt,new RegExp(plan.artSelection.locationFamily,"i"));','assert.match(plan.photoBrief.prompt,new RegExp(plan.artSelection.locationFamily,"i"));','campaign selected world reaches provider prompt');
fs.writeFileSync(p,s);

const diversityTest=`"use strict";\nconst test=require("node:test");\nconst assert=require("node:assert/strict");\nconst fs=require("node:fs");\nconst path=require("node:path");\nconst {LOCATIONS,VARIANTS,selectArtDirection}=require("../netlify/functions/_shared/v3-art-worlds");\nconst {planV3,artisticFingerprint}=require("../netlify/functions/_shared/v3-pipeline");\n\ntest("la rotation visuelle dispose d'au moins douze décors réels et dix variantes de mise en scène",()=>{\n assert.ok(Object.keys(LOCATIONS).length>=12,Object.keys(LOCATIONS).length);\n assert.ok(VARIANTS.length>=10,VARIANTS.length);\n});\n\ntest("dix créations successives avec le même seed ne répètent ni lieu, ni variante, ni angle",()=>{\n const history=[],locations=[],variants=[],angles=[],lights=[];\n for(let i=0;i<10;i++){\n  const selection=selectArtDirection({seed:"meme-seed-volontaire",history,antiRepetitionWindow:10});\n  locations.push(selection.locationFamily);variants.push(selection.narrativeVariant);angles.push(selection.cameraAngle);lights.push(selection.lightingNarrative);\n  history.push({locationFamily:selection.locationFamily,artWorldFamily:selection.artWorldFamily,narrativeSignature:selection.narrativeVariant,cameraAngle:selection.cameraAngle,lightType:selection.lightingNarrative});\n }\n assert.equal(new Set(locations).size,10);\n assert.equal(new Set(variants).size,10);\n assert.equal(new Set(angles).size,10);\n assert.equal(new Set(lights).size,10);\n});\n\ntest("SceneIntent transmet réellement la variation de décor, caméra et lumière au prompt fournisseur",()=>{\n const history=[],locations=new Set(),prompts=new Set(),angles=new Set();\n for(let i=0;i<8;i++){\n  const plan=planV3({service:"Massage Zébré",platform:"Story",subject:"Douleurs dorsales, blocage, sensations de lourdeur",selectedRegisters:["Fantastique","Cinématographie","Architecture"],creativeSeed:"repeatable-seed",artHistory:history,textChoice:"automatic",costMode:"test"});\n  const selection=plan.artSelection,prompt=plan.sceneIntent.providerPrompt;\n  assert.match(prompt,/VARIATION VISUELLE IMPOSÉE/i);\n  assert.ok(prompt.includes(selection.locationFamily),selection.locationFamily);\n  assert.ok(prompt.includes(selection.cameraAngle),selection.cameraAngle);\n  assert.ok(prompt.includes(selection.focalLength),selection.focalLength);\n  assert.ok(prompt.includes(selection.lightingNarrative),selection.lightingNarrative);\n  assert.equal(plan.photoBrief.prompt,prompt);\n  locations.add(selection.locationFamily);angles.add(selection.cameraAngle);prompts.add(prompt);\n  history.push(artisticFingerprint(plan,null,"generated"));\n }\n assert.equal(locations.size,8);\n assert.equal(angles.size,8);\n assert.equal(prompts.size,8);\n});\n\ntest("l'historique réel de l'application est transmis au plan puis mémorise l'empreinte artistique",()=>{\n const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");\n assert.match(html,/artHistory:\(state\.imageHistory\|\|\[\]\)\.map\(x=>x\.artFingerprint\)\.filter\(Boolean\)\.slice\(-10\)/);\n assert.match(html,/historyEntry\.artFingerprint=flow\.artFingerprint\|\|null/);\n});\n`;
fs.writeFileSync('tests/v4-visual-diversity.test.js',diversityTest);
console.log('V4 diversity patch staged');
