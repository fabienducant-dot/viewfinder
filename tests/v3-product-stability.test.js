"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {planV3}=require("../netlify/functions/_shared/v3-pipeline");
const {semanticLines,extractFacts}=require("../netlify/functions/_shared/v3-creative-strategy");
const {layoutFor}=require("../netlify/functions/_shared/brand-compositor");
const {composeBrandPoster,COMPOSITOR_VERSION}=require("../netlify/functions/_shared/brand-compositor");
const sharp=require("sharp");

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

test("Tous sujets institutionnel produit une scène de cabinet concrète sans injonction métier contradictoire",()=>{
  const plan=planV3({service:"Tous sujets",platform:"Instagram",subject:institutionalSubject,textChoice:"automatic",costMode:"test",creativeSeed:"institutional-scene",artHistory:[{locationFamily:"cabinet premium intime"}]});
  assert.equal(plan.artDirection.artistic.locationFamily,"cabinet premium intime");
  assert.equal(plan.posterStrategy.mainSubject,"le cabinet SDZ vu depuis son seuil, avec une perspective intérieure intime et crédible");
  assert.equal(plan.posterStrategy.careOrSolutionManifestation,"invitation visuelle à franchir le seuil et découvrir le lieu");
  assert.match(plan.photoBrief.prompt,/aucune personne, aucun geste de soin et aucun matériel de prestation sauf demande explicite/i);
  assert.doesNotMatch(plan.photoBrief.prompt,/geste métier clairement visible|personnes et rôles lisibles|matériel réel fidèle|La prestation reste|action explicitement suggérée|mini-sujet reste compréhensible|autour de la prestation|soin prioritaire|naturelle du geste|détails corporels et matériels|proche des gestes|interaction centrale/i);
  assert.equal(plan.legacyProjection.caracteristiquePrestationVisible,"le cabinet et son atmosphère accueillante sont immédiatement reconnaissables");
  assert.equal(plan.consistencyReport.checks.genericSceneConcrete,true);
  assert.equal(plan.consistencyReport.checks.genericPromptUnambiguous,true);
});

test("les cinq familles Tous sujets restent concrètes et cohérentes avant tout appel Images",()=>{
  const cases=[
    ["institutional","Venez découvrir notre cabinet à Raismes, expertise depuis 2017."],
    ["event","Journée portes ouvertes le 10 septembre pour découvrir le lieu."],
    ["offer","Nouveau bon cadeau pour offrir une attention singulière."],
    ["transformation","Retrouver de l’élan après une période de fatigue."],
    ["editorial","La force tranquille du zèbre dans un monde pressé."],
  ];
  for(const [kind,subject] of cases){
    const plan=planV3({service:"Tous sujets",platform:"Instagram",subject,textChoice:"automatic",costMode:"test",creativeSeed:`generic-${kind}`});
    assert.equal(plan.subjectBrief.editorialKind,kind);
    assert.equal(plan.consistencyReport.ready,true);
    assert.equal(plan.consistencyReport.checks.genericSceneConcrete,true);
    assert.equal(plan.consistencyReport.checks.genericPromptUnambiguous,true);
  }
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

test("le rendu Instagram institutionnel conserve le titre complet, réduit le sous-titre et détoure le logo",async()=>{
  const plan=planV3({service:"Tous sujets",platform:"Instagram",subject:institutionalSubject,textChoice:"automatic",costMode:"test",creativeSeed:"institutional-compositor-regression"});
  const image=await sharp({create:{width:1080,height:1350,channels:4,background:"#17120b"}}).png().toBuffer();
  const logo=fs.readFileSync(path.join(root,"icons/icon-512.png"));
  const output=await composeBrandPoster({imageBuffer:image,logoDataUrl:`data:image/png;base64,${logo.toString("base64")}`,platform:"Instagram",posterStrategy:plan.posterStrategy});
  const manifest=output.compositionManifest;
  assert.equal(manifest.version,COMPOSITOR_VERSION);
  assert.equal(manifest.completeText,"UN HAVRE DE PAIX À RAISMES | EXPERTISE ET SAVOIR-FAIRE DEPUIS 2017");
  assert.deepEqual(manifest.titleLines,["UN HAVRE DE PAIX","À RAISMES"]);
  assert.deepEqual(manifest.subtitleLines,["EXPERTISE ET SAVOIR-FAIRE","DEPUIS 2017"]);
  assert.equal(manifest.titleExact,true);
  assert.equal(manifest.subtitleExact,true);
  assert.equal(manifest.textWithinCanvas,true);
  assert.equal(manifest.marginsValid,true);
  assert.equal(manifest.hierarchyValid,true);
  assert.equal(manifest.zonesDisjoint,true);
  assert.equal(manifest.logoWithinCanvas,true);
  assert.equal(manifest.logoRectangleOpaque,false);
  assert.ok(manifest.titleSize>manifest.subtitleSize);
  assert.deepEqual([(await sharp(output).metadata()).width,(await sharp(output).metadata()).height],[1080,1350]);
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
