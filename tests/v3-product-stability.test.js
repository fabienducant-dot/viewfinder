"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {planV3}=require("../netlify/functions/_shared/v3-pipeline");
const {semanticLines,extractFacts}=require("../netlify/functions/_shared/v3-creative-strategy");
const {layoutFor}=require("../netlify/functions/_shared/brand-compositor");

const root=path.join(__dirname,"..");
const institutionalSubject="Venez découvrir un havre de paix, au 11 cour Dupas, 59590 à Raismes. Expertise et savoir-faire, prestations réalisées par Fabien depuis 2017.";

test("Tous sujets transforme une phrase institutionnelle en décision éditoriale sans la recopier partout",()=>{
  const plan=planV3({service:"Tous sujets",platform:"Instagram",subject:institutionalSubject,textChoice:"automatic",costMode:"test",creativeSeed:"institutional-regression"});
  assert.equal(plan.subjectBrief.editorialKind,"institutional");
  assert.equal(plan.posterStrategy.title,"UN HAVRE DE PAIX À RAISMES");
  assert.equal(plan.posterStrategy.subtitle,"EXPERTISE ET SAVOIR-FAIRE DEPUIS 2017");
  assert.deepEqual(plan.subjectBrief.verifiedFacts,["11 cour Dupas","59590 Raismes","depuis 2017"]);
  assert.doesNotMatch(plan.subjectBrief.audienceProblem,/Venez découvrir un havre de paix/i);
  assert.doesNotMatch(plan.subjectBrief.physicalOrEmotionalManifestation,/prestations réalisées par Fabien depuis 2017/i);
  assert.equal(plan.consistencyReport.ready,true);
});

test("l'extracteur d'adresse sépare voie, code postal, commune et ancienneté",()=>{
  const facts=extractFacts(institutionalSubject);
  assert.equal(facts.address,"11 cour Dupas");
  assert.deepEqual(facts.location,{postalCode:"59590",city:"Raismes"});
  assert.equal(facts.year,"2017");
});

test("la typographie conserve tous les mots et les zones restent disjointes",()=>{
  const title="UN HAVRE DE PAIX À RAISMES";
  const lines=semanticLines(title,4,18);
  assert.equal(lines.join(" "),title);
  assert.ok(lines.every(line=>!line.includes("…")));
  for(const platform of ["Instagram Square","Instagram Portrait","Facebook","Story","Google Business","Blog","Bannière"]){
    const plan=planV3({service:"Tous sujets",platform:platform==="Instagram Portrait"?"Instagram":platform,subject:institutionalSubject,textChoice:"automatic",costMode:"test",creativeSeed:`layout-${platform}`});
    const template=plan.posterStrategy;
    const dims=plan.artDirection.platform==="Story"?[1080,1920]:plan.artDirection.platform==="Google Business"?[1200,900]:[1080,1350];
    const layout=layoutFor(dims[0],dims[1],plan.artDirection.platform,"",true,{template:plan.preflight&&plan.preflight.template},template);
    assert.ok(layout.textArea.bottom<=layout.logoArea.top,`${platform}: zones superposées`);
  }
});

test("le navigateur utilise un plan unique, réemploie l'analyse serveur et garde un chemin de récupération",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const production=html.slice(html.indexOf("prepareBtn.addEventListener"),html.indexOf("// --- Phase B"));
  assert.match(production,/prepareAuthoritativeV3/);
  assert.doesNotMatch(production,/prepareCreativeBrief/);
  assert.match(html,/const serverAnalysis=productReferenceRequired\?null:analysisFromServer/);
  assert.match(html,/vf-recoverable-image-jobs-v1/);
  assert.match(html,/Récupérer la dernière image payée/);
  assert.match(html,/recompose-image-job/);
});
