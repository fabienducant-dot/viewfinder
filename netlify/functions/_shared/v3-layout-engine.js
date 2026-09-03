"use strict";

const PLATFORM_ALIASES=Object.freeze({"Article Blog Wix":"Blog","Instagram":"Instagram Portrait"});
const PLATFORM_TEMPLATES=Object.freeze({
 "Instagram Square":{width:1080,height:1080,margins:.06,ratioVariant:"1x1-feed",layouts:["Storytelling","Hero","Editorial"],lockup:{x:.08,y:.64,width:.84,align:"center"},contactFields:[]},
 "Instagram Portrait":{width:1080,height:1350,margins:.06,ratioVariant:"4x5-feed",layouts:["Storytelling","Hero","Portrait","Editorial"],lockup:{x:.08,y:.66,width:.84,align:"center"},contactFields:[]},
 Facebook:{width:1200,height:1500,margins:.055,ratioVariant:"4x5-social",layouts:["Storytelling","Editorial","Split","Magazine"],lockup:{x:.055,y:.08,width:.58,align:"left"},contactFields:["domain"]},
 Story:{width:1080,height:1920,margins:.07,ratioVariant:"9x16-fullscreen",layouts:["Storytelling","Immersif","Portrait"],lockup:{x:.07,y:.70,width:.86,align:"center"},contactFields:["domain"]},
 "Google Business":{width:1200,height:900,margins:.06,ratioVariant:"4x3-local",layouts:["Storytelling","Paysage","Hero","Minimal"],lockup:{x:.06,y:.62,width:.50,align:"left"},contactFields:["phone","address"]},
 Blog:{width:1920,height:1080,margins:.05,ratioVariant:"16x9-editorial",layouts:["Storytelling","Paysage","Magazine","Editorial"],lockup:{x:.54,y:.12,width:.41,align:"center"},contactFields:["domain"]},
 Bannière:{width:1920,height:640,margins:.045,ratioVariant:"3x1-banner",layouts:["Storytelling","Monumental","Minimal","Paysage"],lockup:{x:.045,y:.18,width:.44,align:"left"},contactFields:["domain","phone"]},
});
function normalizePlatform(platform){return PLATFORM_ALIASES[platform]||platform;}
function list(value){return Array.isArray(value)?value.filter(Boolean):[];}
function bool(value){return value===true;}
function bounded(value,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;}
function analyzeActualImage(input={}){
 return {
  ...input,
  faces:list(input.faces),activeHands:list(input.activeHands),equipment:list(input.equipment||input.visibleObjects),subjects:list(input.subjects||input.visibleSubjects),
  gazeDirection:String(input.gazeDirection||"unknown"),protectedZones:list(input.protectedZones),calmZones:list(input.calmZones),availableContrast:bounded(input.availableContrast),density:bounded(input.density),negativeSpace:list(input.negativeSpace),
  peopleCount:Number(input.peopleCount??list(input.faces).length),identityCount:Number(input.identityCount??input.peopleCount??list(input.faces).length),sameBeneficiary:bool(input.sameBeneficiary),samePractitioner:bool(input.samePractitioner),foreignPersonPresent:bool(input.foreignPersonPresent),practitionerGender:String(input.practitionerGender||"indeterminate"),businessCompliance:input.businessCompliance!==false,requiredActionVisible:bool(input.requiredActionVisible),compositeStages:list(input.compositeStages),parasites:list(input.parasites),paletteDrift:bounded(input.paletteDrift),
  subjectMatchesRequest:bool(input.subjectMatchesRequest),dramaticMomentPresent:bool(input.dramaticMomentPresent),transformationReadable:bool(input.transformationReadable),cinematicPosterRead:bool(input.cinematicPosterRead),threePlaneDepth:bool(input.threePlaneDepth),genericSpaRisk:bounded(input.genericSpaRisk),literalTreatmentSceneRisk:bounded(input.literalTreatmentSceneRisk),observedRegisters:list(input.observedRegisters),architectureObserved:bool(input.architectureObserved),fantasticObserved:bool(input.fantasticObserved),brandSafeZoneAvailable:bool(input.brandSafeZoneAvailable),productFidelity:bool(input.productFidelity),
 };
}
function chooseLayout({platform,contract,analysis}){
 const normalized=normalizePlatform(platform);const t=PLATFORM_TEMPLATES[normalized];if(!t)throw new Error(`Plateforme V3 inconnue : ${platform}`);
 const composite=contract.type==="offre composite";const compatible=t.layouts.filter(x=>contract.compatibleLayouts.includes(x));let family=compatible[0]||t.layouts[0];
 if(composite||contract.recommendedLayout==="Storytelling")family="Storytelling";
 else if(analysis.negativeSpace.length&&analysis.density<.55&&t.layouts.includes("Minimal"))family="Minimal";
 else if(analysis.faces.length>1&&t.layouts.includes("Split"))family="Split";
 if(!t.layouts.includes(family))throw new Error(`Layout ${family} absent du template ${normalized}`);
 return {platform:normalized,family,variant:`${family}-${t.ratioVariant}-${analysis.calmZones[0]||"safe"}`,template:t,rationale:`Choix sur image réelle : ${analysis.peopleCount} personne(s), densité ${analysis.density}, zone calme ${analysis.calmZones[0]||"marge sûre"}, moment dramatique ${analysis.dramaticMomentPresent?"oui":"non"}.`};
}
module.exports={PLATFORM_TEMPLATES,normalizePlatform,analyzeActualImage,chooseLayout};
