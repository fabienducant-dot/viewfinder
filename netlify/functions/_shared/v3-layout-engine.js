"use strict";
const PLATFORM_TEMPLATES=Object.freeze({
 Instagram:{width:1088,height:1360,margins:.06,layouts:["Hero","Portrait","Editorial"]},
 Facebook:{width:1200,height:1500,margins:.055,layouts:["Editorial","Split","Magazine"]},
 Story:{width:1088,height:1920,margins:.07,layouts:["Storytelling","Immersif","Portrait"]},
 "Google Business":{width:1200,height:900,margins:.06,layouts:["Paysage","Hero","Minimal"]},
 Blog:{width:1920,height:1088,margins:.05,layouts:["Paysage","Magazine","Editorial"]},
 Bannière:{width:1920,height:640,margins:.045,layouts:["Monumental","Minimal","Paysage"]},
});
function analyzeActualImage(input={}){return {faces:input.faces||[],activeHands:input.activeHands||[],equipment:input.equipment||[],subjects:input.subjects||[],gazeDirection:input.gazeDirection||"unknown",protectedZones:input.protectedZones||[],calmZones:input.calmZones||[],availableContrast:Number(input.availableContrast||0),density:Number(input.density||0),negativeSpace:input.negativeSpace||[],peopleCount:Number(input.peopleCount||0),businessCompliance:input.businessCompliance!==false,parasites:input.parasites||[]};}
function chooseLayout({platform,contract,analysis}){const t=PLATFORM_TEMPLATES[platform];if(!t)throw new Error(`Plateforme V3 inconnue : ${platform}`);const compatible=t.layouts.filter(x=>contract.compatibleLayouts.includes(x));let family=compatible[0]||t.layouts[0];if(contract.recommendedLayout==="Storytelling"&&t.layouts.includes("Storytelling"))family="Storytelling";else if(analysis.negativeSpace.length&&analysis.density<.55&&t.layouts.includes("Minimal"))family="Minimal";else if(analysis.faces.length>1&&t.layouts.includes("Split"))family="Split";return {platform,family,variant:`${family}-${analysis.calmZones[0]||"safe"}`,template:t,rationale:`Choix sur image réelle : ${analysis.peopleCount} personne(s), densité ${analysis.density}, zone calme ${analysis.calmZones[0]||"marge sûre"}.`};}
module.exports={PLATFORM_TEMPLATES,analyzeActualImage,chooseLayout};
