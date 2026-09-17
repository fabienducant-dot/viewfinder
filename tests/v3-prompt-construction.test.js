"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {getServiceContract}=require("../netlify/functions/_shared/v3-registry");
const {inferSubjectBrief,buildPosterStrategy,buildLegacyProjection,buildPostCopyStrategy,buildCampaignCreativeDirection}=require("../netlify/functions/_shared/v3-creative-strategy");
const {createArtDirectionBrief,buildPhotoBrief,SDZ_VISUAL_FOUNDATION,SDZ_PERMANENT_EXCLUSIONS,relevantExclusions}=require("../netlify/functions/_shared/v3-art-direction");
const {buildConsistencyReport}=require("../netlify/functions/_shared/v3-consistency-control");
const {planV3}=require("../netlify/functions/_shared/v3-pipeline");

const CASES=Object.freeze([
 {id:"massage-zebre",service:"Massage Zébré",subject:"Douleurs dorsales, blocages et sensation de lourdeur : le geste personnalisé doit rendre visible le passage vers plus d’amplitude."},
 {id:"abhyanga",service:"Massage Ayurvédique Abhyanga",subject:"Lâcher-prise par de longs mouvements huilés continus de la tête aux pieds, dans une scène chaleureuse et profondément apaisante."},
 {id:"reiki",service:"Reiki",subject:"Un mental saturé retrouve du calme pendant une séance de Reiki, avec une imposition des mains subtile au-dessus du torse, sans rayon magique."},
 {id:"psio",service:"Luminothérapie PSIO®",subject:"Retrouver un espace mental calme grâce à une séance PSiO, avec les lunettes officielles fidèles portées en position semi-allongée."},
 {id:"visage-japonais",service:"Massage japonais du visage",subject:"Éclat et détente du visage grâce à une gestuelle faciale japonaise précise sur le visage et le cou, jamais un massage générique du dos."},
 {id:"douleurs-blocages",service:"Tous sujets",subject:"Douleurs, blocages et lourdeur : une silhouette contrainte au premier plan avance vers une architecture ouverte, un horizon clair et davantage d’amplitude."},
 {id:"mental-lacher-prise",service:"Tous sujets",subject:"Le mental oppressant et les ruminations laissent place au lâcher-prise : l’espace resserré s’ouvre vers un paysage calme, une eau noire réfléchissante et un horizon doré."},
]);

function createPrompt(sample){
 const contract=getServiceContract(sample.service);
 const subjectBrief=inferSubjectBrief({subject:sample.subject,service:sample.service,contract,selectedRegisters:["cinématographique","fantastique crédible"]});
 const artDirection=createArtDirectionBrief({service:sample.service,platform:"Story",creativeSeed:`prompt-test-${sample.id}`,artHistory:[],subjectBrief});
 const posterStrategy=buildPosterStrategy({subjectBrief,contract,artDirection,platform:"Story",textChoice:"editorial"});
 const photoBrief=buildPhotoBrief(artDirection,{subjectBrief,posterStrategy});
 const legacyProjection=buildLegacyProjection({subjectBrief,posterStrategy,artDirection,contract});
 const postCopyStrategy=buildPostCopyStrategy({platform:"Story",subjectBrief,posterStrategy,contract,history:[]});
 const campaignCreativeDirection=buildCampaignCreativeDirection({posterStrategy,postCopyStrategy,contract});
 const consistencyReport=buildConsistencyReport({contract,subjectBrief,posterStrategy,artDirection,photoBrief,legacyProjection,postCopyStrategy,campaignCreativeDirection,platform:"Story"});
 return {contract,subjectBrief,artDirection,posterStrategy,photoBrief,consistencyReport};
}

for(const sample of CASES){
 test(`${sample.id}: la demande exacte reste prioritaire dans le prompt final`,()=>{
  const {subjectBrief,photoBrief}=createPrompt(sample);
  assert.equal(subjectBrief.exactUserRequest,sample.subject);
  assert.ok(subjectBrief.userConstraints.length>0);
  assert.match(photoBrief.prompt,new RegExp(sample.subject.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.ok(photoBrief.prompt.indexOf(sample.subject)<photoBrief.prompt.indexOf("DIRECTION ARTISTIQUE SDZ"));
 });
}

test("socle SDZ, composition Sharp et interdits permanents sont déterministes",()=>{
 const {photoBrief}=createPrompt(CASES[0]);
 assert.match(photoBrief.prompt,new RegExp(SDZ_VISUAL_FOUNDATION.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 assert.match(photoBrief.prompt,/Noir profond mais détaillé, jamais bouché/);
 assert.match(photoBrief.prompt,/Or noble métallique ou satiné/);
 assert.match(photoBrief.prompt,/Trois plans lisibles/);
 assert.match(photoBrief.prompt,/Zone de respiration réservée au futur branding Sharp/);
 assert.match(photoBrief.prompt,/partie basse du cadre/);
 assert.doesNotMatch(photoBrief.prompt,/30 % inférieurs|70 %|30 % maximum/);
 assert.match(photoBrief.prompt,/Générer uniquement la scène photographique/);
 assert.match(photoBrief.prompt,/Aucun logo SDZ/);
 assert.match(photoBrief.prompt,/Le logo et les textes seront ajoutés ensuite de manière déterministe par Sharp/);
 for(const exclusion of SDZ_PERMANENT_EXCLUSIONS)assert.ok(photoBrief.prompt.includes(exclusion),`interdit absent : ${exclusion}`);
 assert.ok(photoBrief.prompt.length<7000,`prompt trop long : ${photoBrief.prompt.length}`);
});

test("les contrats métier restent visibles et cohérents",()=>{
 const massage=createPrompt(CASES[0]).photoBrief.prompt;
 assert.match(massage,/praticien et bénéficiaire tous deux visibles, actifs/);
 assert.match(massage,/enchaînement personnalisé fluide/);
 assert.match(massage,/Zone corporelle : dos/);
 assert.match(massage,/praticien est obligatoirement un homme adulte, Fabien/i);
 assert.doesNotMatch(massage,/représenter visuellement Fabien|reproduire le visage de Fabien/);
 assert.match(massage,/pierres de soin ou galets décoratifs, jamais la pierre architecturale/);

 const abhyanga=createPrompt(CASES[1]).photoBrief.prompt;
 assert.match(abhyanga,/long mouvement huilé synchronisé/);
 assert.match(abhyanga,/huile et mouvements continus tête-pieds/);

 const reiki=createPrompt(CASES[2]).photoBrief.prompt;
 assert.match(reiki,/imposition des mains sans contact/);
 assert.match(reiki,/mains parallèles au-dessus du torse/);
 assert.match(reiki,/occultisme ou rituel/);
 assert.match(reiki,/portail ou rayon lumineux central systématique/);

 const psio=createPrompt(CASES[3]).photoBrief.prompt;
 assert.match(psio,/lunettes PSiO® officielles/);
 assert.match(psio,/fidélité produit obligatoire/);
 assert.match(psio,/semi-allongé/);

 const visage=createPrompt(CASES[4]).photoBrief.prompt;
 assert.match(visage,/lifting manuel symétrique/);
 assert.match(visage,/gestuelle faciale japonaise nette/);
 assert.match(visage,/visage, cou/);
 assert.match(visage,/jamais un massage générique du dos/);
});

test("les sujets douleurs et mental modifient explicitement la scène",()=>{
 const douleur=createPrompt(CASES[5]);
 assert.match(douleur.subjectBrief.subjectVisualDirective,/contrainte dans la posture/);
 assert.match(douleur.subjectBrief.subjectVisualDirective,/ouverture crédible/);
 assert.match(douleur.subjectBrief.exactUserRequest,/architecture ouverte/);
 assert.match(douleur.photoBrief.prompt,/éléments spatiaux explicitement demandés/);
 assert.match(douleur.photoBrief.prompt,/Ils gouvernent l’architecture, le paysage, l’échelle et la profondeur/);

 const mental=createPrompt(CASES[6]);
 assert.match(mental.subjectBrief.subjectVisualDirective,/premier plan dense ou resserré/);
 assert.match(mental.subjectBrief.subjectVisualDirective,/perspective calme, ample et respirante/);
 assert.match(mental.subjectBrief.exactUserRequest,/paysage calme/);
 assert.match(mental.photoBrief.prompt,/éléments spatiaux explicitement demandés/);
});

test("le décor est composé selon le sujet, sans imposer les trois anciens lieux",()=>{
 for(const sample of CASES){
  const {artDirection,photoBrief}=createPrompt(sample);
  assert.match(photoBrief.prompt,/ENVIRONNEMENT COMPOSÉ/);
 assert.match(photoBrief.prompt,/Registres actifs/);
  assert.doesNotMatch(photoBrief.prompt,/70 %|30 % maximum/);
  if(sample.service==="Tous sujets"&&!artDirection.spatialAuthority){
   assert.ok(!photoBrief.prompt.includes(artDirection.artistic.architectureDescription),`${sample.id}: architecture fixe encore imposée`);
   assert.ok(!photoBrief.prompt.includes(artDirection.artistic.locationFamily),`${sample.id}: lieu fixe encore imposé`);
  }
  assert.ok(!photoBrief.prompt.includes(artDirection.artistic.fantasticPhenomenon),`${sample.id}: effet fantastique fixe encore imposé`);
 }
});

test("le fantastique reste narratif, libre et crédible",()=>{
 const {photoBrief}=createPrompt(CASES[2]);
 assert.match(photoBrief.prompt,/architecture impossible mais crédible/);
 assert.match(photoBrief.prompt,/échelle, du paysage et de la lumière/);
 assert.match(photoBrief.prompt,/jamais kitsch ni magique/);
 assert.doesNotMatch(photoBrief.prompt,/PHÉNOMÈNE FANTASTIQUE PÉRIPHÉRIQUE/);
});

test("les interdits sont dédupliqués avant insertion",()=>{
 for(const sample of CASES){
  const {contract,photoBrief}=createPrompt(sample);
  const exclusions=relevantExclusions(contract).filter(item=>!contract.generic||!/soin|prestation/i.test(item));
  const normalized=exclusions.map(value=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase());
  assert.equal(new Set(normalized).size,normalized.length,`${sample.id}: doublon exact`);
  const section=photoBrief.prompt.match(/INTERDITS — ([\s\S]*?)\.\n\nSORTIE BRUTE/)?.[1];
  assert.equal(section,exclusions.join(", "));
 }
});

test("le contrôle de cohérence V3 accepte les sept prompts avant tout appel image",()=>{
 for(const sample of CASES){
  const {consistencyReport}=createPrompt(sample);
  assert.equal(consistencyReport.ready,true,`${sample.id}: ${consistencyReport.blockingReasons.join(", ")}`);
  assert.equal(consistencyReport.checks.artDirectionConsistency,true);
  assert.equal(consistencyReport.checks.promptInspectorMatchesImages,true);
 }
});

test("create-image-job envoie bien l'unique prompt V3 au job image",()=>{
 const source=fs.readFileSync(path.join(__dirname,"../netlify/functions/create-image-job.js"),"utf8");
 assert.match(source,/prompt=v3Plan\.photoBrief\.prompt/);
 assert.match(source,/model:model\|\|"gpt-image-2"/);
 assert.doesNotMatch(source,/buildFinalImagePrompt\s*\(/);
});

module.exports={CASES,createPrompt};

function genericPlan(subject,selectedRegisters=["cinématographique"]){return planV3({service:"Tous sujets",platform:"Story",subject,selectedRegisters,textChoice:"editorial",costMode:"production",quality:"high",size:"1008x1792",creativeSeed:`targeted-${subject}`});}

test("décor explicite : le temple gouverne les métadonnées sans cabinet concurrent",()=>{const plan=genericPlan("Temple donnant vue sur un paysage féerique.",["cinématographique","fantastique","architectural"]);const selected=JSON.stringify({art:plan.artDirection.artistic,poster:plan.posterStrategy});assert.match(selected,/Temple donnant vue sur un paysage féerique/i);assert.doesNotMatch(selected,/cabinet (?:premium |contemporain |cinématographique )?intime/i);});
test("le registre fantastique active réellement le fantastique",()=>{const plan=genericPlan("Une silhouette contemple un horizon nocturne.",["cinématographique","fantastique"]);assert.equal(plan.artDirection.activeRegisters.fantastic,true);assert.match(plan.photoBrief.prompt,/fantastique crédible/);});
test("sans registre fantastique, le socle n'impose aucun univers fantastique",()=>{const prompt=genericPlan("Une tasse noire posée sur une table, éclairée latéralement.",["cinématographique"]).photoBrief.prompt;assert.doesNotMatch(prompt,/univers fantastique|architecture fantastique|architecture spectaculaire/i);});
test("sans demande architecturale, aucune monumentalité n'est imposée",()=>{const prompt=genericPlan("Une matière textile noire révèle un reflet doré discret.",["cinématographique"]).photoBrief.prompt;assert.doesNotMatch(prompt,/architecture monumentale|architecture spectaculaire|monumentalité/i);});
test("douleurs dorsales produit un focus dos et posture sans inventer de soin",()=>{const plan=genericPlan("Douleurs dorsales et sensation de lourdeur.");assert.equal(plan.subjectBrief.requestedFocus,"dos / posture");assert.match(plan.photoBrief.prompt,/dos \/ posture/);assert.doesNotMatch(plan.photoBrief.prompt,/geste professionnel|contact .*prestation|soin immédiatement identifiable/i);});
test("une demande explicite sans personne reste sans personne",()=>{const plan=genericPlan("Une forêt noire qui s'ouvre vers une clairière lumineuse, sans personne.",["cinématographique"]);assert.equal(plan.subjectBrief.forbidsPeople,true);assert.match(plan.photoBrief.prompt,/Aucune personne dans la scène/);});
test("lourdeur et blocage autorisent une présence humaine sans praticien",()=>{const plan=genericPlan("Blocage et lourdeur corporelle qui évoluent vers plus d'amplitude.");assert.equal(plan.subjectBrief.humanNarrativeNeeded,true);assert.match(plan.subjectBrief.peoplePolicy,/personne anonyme/);assert.match(plan.photoBrief.prompt,/personne anonyme/);assert.doesNotMatch(plan.photoBrief.prompt,/praticien et bénéficiaire|geste professionnel/i);});
test("la demande exacte n'est injectée qu'une fois dans le prompt",()=>{const request="Douleurs dorsales, blocage, sensations de lourdeur. Fond paysage fantastique, cinématographique, architectural. Temple donnant vue sur un paysage féerique.";const prompt=genericPlan(request,["fantastique","cinématographique","architectural"]).photoBrief.prompt;assert.equal(prompt.split(request).length-1,1);assert.ok(prompt.length<5000,`prompt encore trop long : ${prompt.length}`);});
test("un décor de forêt ne récupère ni temple ni cabinet",()=>{const plan=genericPlan("Une personne marche dans une forêt sombre qui s'ouvre vers une clairière lumineuse.",["cinématographique"]);const selected=JSON.stringify({art:plan.artDirection.artistic,poster:plan.posterStrategy,prompt:plan.photoBrief.prompt});assert.match(selected,/forêt sombre/i);assert.doesNotMatch(selected,/temple|cabinet premium|cabinet contemporain/i);});
test("le plan Golden conserve transformation, décor et registres sans contamination métier",()=>{const request="Douleurs dorsales, blocage, sensations de lourdeur. Fond paysage fantastique, cinématographique, architectural. Temple donnant vue sur un paysage féerique.";const plan=genericPlan(request,["fantastique","cinématographique","architectural"]);assert.match(plan.subjectBrief.dramaticMoment,/poids et tension visibles/);assert.match(plan.subjectBrief.dramaticMoment,/espace s’ouvre/);assert.deepEqual(plan.artDirection.activeRegisters,{cinematic:true,fantastic:true,architectural:true});assert.match(plan.photoBrief.prompt,/temple donnant vue sur un paysage féerique/i);assert.doesNotMatch(plan.photoBrief.prompt,/cabinet imposé|geste professionnel|contact .*prestation/i);});
test("Story utilise une résolution gpt-image-2 exactement 9:16",()=>{const source=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");assert.match(source,/"Story": "1008x1792"/);assert.equal(1008/1792,9/16);assert.equal(1008%16,0);assert.equal(1792%16,0);});
