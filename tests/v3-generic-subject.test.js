"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {planV3}=require("../netlify/functions/_shared/v3-pipeline");
const {buildJobInput}=require("../netlify/functions/create-image-job");
const {interpretGenericSubject,OFFICIAL_FACTS}=require("../netlify/functions/_shared/v3-creative-strategy");
const {validatePlatformPayload}=require("../netlify/functions/check-scheduled-posts");
const scenarios=[
 ["institutional","Venez découvrir notre lieu intime et accueillant au 11 cour Dupas, 59156 Raismes, une expérience immersive et sensible depuis 2019"],
 ["gift","Offrir un bon cadeau pour une attention qui compte"],
 ["schedule_update","Fermeture exceptionnelle puis reprise le 03/09/2026"],
 ["event","Portes ouvertes et atelier le 12/10/2026"],
 ["practical_information","Informations d’accès au 11 cour Dupas, 59590 Raismes"],
 ["emotional_message","Retrouver de l’élan dans une période chargée"],
];
function plan(subject,platform="Instagram"){return planV3({service:"Tous sujets",platform,subject,marketingObjective:"Promouvoir une prestation",textChoice:"automatic",creativeSeed:`generic-${subject}`,costMode:"test"});}
test("l'interpréteur Tous sujets produit les neuf niveaux structurés attendus",()=>{for(const [type,subject] of scenarios){const i=interpretGenericSubject(subject,"Promouvoir une prestation");assert.equal(i.communicationType,type);for(const field of ["subjectIntent","factualElements","emotionalIdea","concreteVisualSubject","visualAction","environment","titleStrategy","platformCopyStrategy"])assert.ok(i[field],`${type}.${field}`);assert.notEqual(i.marketingObjective,"Promouvoir une prestation");}});
test("la présentation institutionnelle devient une scène concrète sans logique prestation",()=>{const p=plan(scenarios[0][1]),q=p.photoBrief.prompt;assert.equal(p.subjectBrief.communicationType,"institutional");assert.match(p.subjectBrief.marketingObjective,/Présenter La Santé des Zèbres/);assert.match(p.posterStrategy.mainSubject,/interprétation éditoriale de l’univers du cabinet SDZ/i);assert.match(p.posterStrategy.careOrSolutionManifestation,/regard progresse.*espace ouvert/i);assert.equal(p.legacyProjection.presenceSoin,"aucune");assert.match(p.legacyProjection.cadrage,/perspective architecturale accueillante/i);assert.equal(p.artSelection.locationFamily,"cabinet premium intime");for(const forbidden of ["aucune zone corporelle imposée","sans geste métier inventé","sujet, personnes ou objet dérivés exclusivement du mini-sujet","le mini-sujet reste compréhensible sans injecter de prestation","matériel ou geste","prestation, geste et matière lisibles"])assert.doesNotMatch(q,new RegExp(forbidden,"i"));assert.doesNotMatch(q,/praticien|bénéficiaire|massage|Reiki|PSiO/i);assert.match(q,/interprétation éditoriale de l’univers du cabinet SDZ/i);});
test("titre générique résume l'intention, exclut adresse et fragments faibles",()=>{for(const [,subject] of scenarios){const p=plan(subject),title=p.posterStrategy.title;assert.ok(title);assert.doesNotMatch(title,/\b\d{1,4}\s+(cour|rue|avenue)|\b\d{5}\b/i);assert.doesNotMatch(title,/\b(au|à|de|du|le|la|un)$/i);assert.ok(p.posterStrategy.titleLines.length<=4);assert.notEqual(title,subject.toUpperCase());}});
test("faits utilisateur conservés et contradiction officielle signalée sans remplacement",()=>{const p=plan(scenarios[0][1]);assert.ok(p.subjectBrief.factualElements.userProvided.includes("11 cour Dupas, 59156 Raismes"));assert.ok(p.subjectBrief.factualElements.userProvided.includes("depuis 2019"));assert.match(p.subjectBrief.factualElements.contradictions[0].userValue,/59156/);assert.equal(p.subjectBrief.factualElements.contradictions[0].officialValue,OFFICIAL_FACTS.address);assert.equal(p.postCopyStrategy.controls.unsupportedFactRisk,8);assert.ok(p.postCopyStrategy.practicalInformation.includes("11 cour Dupas, 59156 Raismes"));});
test("copy Tous sujets ne recopie ni sujet brut, cliché ni hashtag métier",()=>{const p=plan(scenarios[0][1]);assert.notEqual(p.postCopyStrategy.emotionalHook,p.subjectBrief.rawSubject);assert.doesNotMatch(p.postCopyStrategy.emotionalHook,/havre de paix|voyage sensoriel/i);assert.deepEqual(p.postCopyStrategy.hashtagStrategy.items,["#LaSanteDesZebres","#Raismes","#ProcheValenciennes"]);assert.doesNotMatch(JSON.stringify(p.postCopyStrategy),/#Massage|prestation proposée/i);});
test("pipeline, Make et coûts gardent une seule vérité sans appel exécuté",()=>{for(const [,subject] of scenarios){const p=plan(subject),job=buildJobInput({v3Plan:p,costMode:"test",quality:"low",costCeilingConfirmed:true}),text=`Texte validé ${p.subjectBrief.communicationType}`;assert.equal(job.prompt,p.photoBrief.prompt);assert.equal(job.costAudit.image.n,1);assert.equal(job.costAudit.imageGenerationCallCount,1);assert.equal(validatePlatformPayload({platform:"Instagram",postCopyStrategy:p.postCopyStrategy,textFinal:text,validatedText:text}),true);}const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");assert.match(html,/N’injecte aucune prestation/);assert.match(html,/factualElements\.contradictions/);});

test("les variantes d’adresse française convergent sans préposition orpheline",()=>{
 const {extractFrenchAddresses}=require("../netlify/functions/_shared/v3-creative-strategy");
 for(const value of ["11 cour Dupas, 59590 Raismes","11 cour Dupas, 59590 à Raismes","au 11 cour Dupas, 59590 RAISMES"]){
  assert.deepEqual(extractFrenchAddresses(value),["11 cour Dupas, 59590 Raismes"]);
 }
 const different=interpretGenericSubject("12 rue Autre, 75001 Paris");
 assert.equal(different.factualElements.contradictions[0].field,"address");
 assert.equal(different.factualElements.contradictions[0].userValue,"12 rue Autre, 75001 Paris");
});

test("Tous sujets déclare fidélité, échelle intime et absence transversale de soin",()=>{
 for(const [,subject] of scenarios){
  const p=plan(subject),strings=JSON.stringify({prompt:p.photoBrief.prompt,poster:p.posterStrategy,campaign:p.campaignCreativeDirection,copy:p.postCopyStrategy,legacy:p.legacyProjection});
  assert.equal(p.photoBrief.locationReferenceUsed,false);
  assert.equal(p.photoBrief.locationFidelityMode,"inspired");
  assert.match(p.photoBrief.prompt,/INTERPRÉTATION INSPIRÉE/);
  assert.doesNotMatch(p.posterStrategy.mainSubject,/intérieur actuel/i);
  assert.equal(p.consistencyReport.checks.noCareResidualWhenCareAbsent,true);
  assert.equal(p.consistencyReport.checks.environmentScaleConsistency,true);
  assert.equal(p.consistencyReport.checks.addressGrammarValid,true);
  assert.doesNotMatch(strings,/soin au centre|geste métier|matériel de soin|praticien imposé|bénéficiaire|prestation visible/i);
 }
});

test("titre, sous-titre, signature et logo ne répètent pas la marque",()=>{
 const p=plan(scenarios[0][1]);
 assert.equal(p.consistencyReport.checks.brandTextRedundancyRisk,false);
 assert.notEqual(p.posterStrategy.title,p.posterStrategy.subtitle);
 assert.equal(p.posterStrategy.brandLine,"");
 assert.doesNotMatch(p.posterStrategy.title,/LA SANTÉ DES ZÈBRES/i);
 assert.doesNotMatch(p.posterStrategy.subtitle,/LA SANTÉ DES ZÈBRES/i);
});

test("une référence officielle active le mode faithful sans changer les garde-fous",()=>{
 const p=planV3({service:"Tous sujets",platform:"Instagram",subject:scenarios[0][1],marketingObjective:"Promouvoir une prestation",textChoice:"automatic",creativeSeed:"generic-faithful",costMode:"test",locationReferenceUsed:true});
 assert.equal(p.photoBrief.locationReferenceUsed,true);
 assert.equal(p.photoBrief.locationFidelityMode,"faithful");
 assert.match(p.photoBrief.prompt,/INTERPRÉTATION FIDÈLE/);
});
