"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {LOCATIONS,VARIANTS,selectArtDirection}=require("../netlify/functions/_shared/v3-art-worlds");
const {planV3,artisticFingerprint}=require("../netlify/functions/_shared/v3-pipeline");

test("la rotation visuelle dispose d'au moins douze décors réels et dix variantes de mise en scène",()=>{
  assert.ok(Object.keys(LOCATIONS).length>=12,Object.keys(LOCATIONS).length);
  assert.ok(VARIANTS.length>=10,VARIANTS.length);
});

test("dix nouvelles créations successives ne répètent ni lieu, ni variante, ni angle",()=>{
  const history=[],locations=[],variants=[],angles=[],lights=[];
  for(let i=0;i<10;i++){
    const seed="nouvelle-creation-"+i;
    const selection=selectArtDirection({seed,history,antiRepetitionWindow:10});
    locations.push(selection.locationFamily);
    variants.push(selection.narrativeVariant);
    angles.push(selection.cameraAngle);
    lights.push(selection.lightingNarrative);
    history.push({creativeSeed:seed,sceneKey:selection.sceneKey,locationFamily:selection.locationFamily,artWorldFamily:selection.artWorldFamily,narrativeSignature:selection.narrativeVariant,cameraAngle:selection.cameraAngle,lightType:selection.lightingNarrative});
  }
  assert.equal(new Set(locations).size,10);
  assert.equal(new Set(variants).size,10);
  assert.equal(new Set(angles).size,10);
  assert.equal(new Set(lights).size,10);
});

test("une même campagne conserve son monde entre formats, une nouvelle création en change",()=>{
  const first=selectArtDirection({seed:"campagne-unique"});
  const history=[{creativeSeed:"campagne-unique",sceneKey:first.sceneKey,locationFamily:first.locationFamily,artWorldFamily:first.artWorldFamily,narrativeSignature:first.narrativeVariant}];
  for(const platform of ["Story","Instagram Portrait","Facebook","Blog","Bannière"]){
    const same=selectArtDirection({seed:"campagne-unique",history});
    assert.equal(same.locationFamily,first.locationFamily,platform);
    assert.equal(same.narrativeVariant,first.narrativeVariant,platform);
    assert.equal(same.campaignContinuity,true,platform);
  }
  const next=selectArtDirection({seed:"campagne-suivante",history});
  assert.notEqual(next.locationFamily,first.locationFamily);
  assert.equal(next.campaignContinuity,false);
});

test("SceneIntent transmet réellement la variation de décor, caméra et lumière au prompt fournisseur",()=>{
  const history=[],locations=new Set(),prompts=new Set(),angles=new Set();
  for(let i=0;i<8;i++){
    const seed="vraie-generation-"+i;
    const plan=planV3({service:"Massage Zébré",platform:"Story",subject:"Douleurs dorsales, blocage, sensations de lourdeur",selectedRegisters:["Fantastique","Cinématographie","Architecture"],creativeSeed:seed,artHistory:history,textChoice:"automatic",costMode:"test"});
    const selection=plan.artSelection,prompt=plan.sceneIntent.providerPrompt;
    assert.match(prompt,/VARIATION VISUELLE IMPOSÉE/i);
    for(const expected of [selection.locationFamily,selection.cameraAngle,selection.focalLength,selection.lightingNarrative])assert.ok(expected&&prompt.includes(expected),expected);
    assert.equal(plan.artDirection.cameraAngle,selection.cameraAngle);
    assert.equal(plan.artDirection.focalLength,selection.focalLength);
    assert.equal(plan.photoBrief.prompt,prompt);
    locations.add(selection.locationFamily);
    angles.add(selection.cameraAngle);
    prompts.add(prompt);
    history.push(artisticFingerprint(plan,null,"generated"));
  }
  assert.equal(locations.size,8);
  assert.equal(angles.size,8);
  assert.equal(prompts.size,8);
  assert.ok(history.every((entry,i)=>entry.creativeSeed==="vraie-generation-"+i));
});

test("l'historique réel de l'application utilise un seed neuf par création puis mémorise l'empreinte artistique",()=>{
  const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  assert.match(html,/artHistory:\(state\.imageHistory\|\|\[\]\)\.map\(x=>x\.artFingerprint\)\.filter\(Boolean\)\.slice\(-10\)/);
  assert.match(html,/creativeSeed:`\$\{prestation\}-\$\{topic\}-\$\{Date\.now\(\)\}`/);
  assert.match(html,/historyEntry\.artFingerprint=flow\.artFingerprint\|\|null/);
});
