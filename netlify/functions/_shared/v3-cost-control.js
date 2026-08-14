"use strict";
/* Les tarifs Images d'entrée n'étant pas exposés de façon assez déterministe au préflight,
   la borne haute est volontairement prudente et configurable. Ce n'est jamais une facture. */
const UNKNOWN_REFERENCE_INPUT_MAX_EUR=.30, PROMPT_TEXT_MAX_EUR=.005;
const COST_MODES=Object.freeze({
 test:{id:"test",label:"MODE TEST — une photographie économique pour valider la scène et le layout",quality:"low",imageCalls:1,n:1,automaticRetries:0,estimatedPhotoEur:.18,estimatedVisionEur:.01,referencePolicy:"profile_only"},
 production:{id:"production",label:"MODE PRODUCTION — photographie finale haute qualité",quality:"high",imageCalls:1,n:1,automaticRetries:0,estimatedPhotoEur:.72,estimatedVisionEur:.01,referencePolicy:"all_official"},
 recompose:{id:"recompose",label:"RECOMPOSER L’AFFICHE EXISTANTE — AUCUN COÛT IMAGE",quality:null,imageCalls:0,n:0,automaticRetries:0,estimatedPhotoEur:0,estimatedVisionEur:0,referencePolicy:"none"},
});
function costMode(id){return {...(COST_MODES[id]||COST_MODES.test)};}
function selectedReferenceRoles(mode,availableRoles=[]){const roles=availableRoles.filter(Boolean);if(mode==="recompose")return [];if(mode==="test")return roles.includes("profile_worn")?["profile_worn"]:[];return ["profile_worn","front_worn","product"].filter(x=>roles.includes(x));}
function buildCostAudit({mode="test",referenceImageCount=0,referenceRoles,imageUsage=null,visionUsage=null,textUsage=null,retries=0,imageCalls,requestedQuality,requestedSize,effectiveSize}={}){
 const config=costMode(mode),photoCalls=imageCalls??config.imageCalls,visionCalls=config.id==="recompose"||visionUsage===false?0:1;
 const roles=referenceRoles||selectedReferenceRoles(config.id,["profile_worn","front_worn","product"].slice(0,referenceImageCount));
 const outputImageEstimate=photoCalls?config.estimatedPhotoEur:0,promptTextEstimate=photoCalls?{min:0,max:PROMPT_TEXT_MAX_EUR,status:"estimated"}:{min:0,max:0,status:"not_applicable"};
 const referenceImageInputEstimate=roles.length?{min:0,max:UNKNOWN_REFERENCE_INPUT_MAX_EUR,status:"unknown",message:"Coût des références PSiO® non déterminable avant facturation — non inclus dans les 0,18 €"}:{min:0,max:0,status:"not_applicable",message:"Aucune référence envoyée"};
 const visionEstimate=visionCalls?config.estimatedVisionEur:0,estimatedTotalMin=outputImageEstimate+promptTextEstimate.min+referenceImageInputEstimate.min+visionEstimate,estimatedTotalMax=outputImageEstimate+promptTextEstimate.max+referenceImageInputEstimate.max+visionEstimate;
 return {mode:config.id,requestedMode:mode,effectiveMode:config.id,estimateNotInvoice:true,estimateConfidence:roles.length?"low":"medium",requestedQuality:requestedQuality||config.quality,effectiveQuality:config.quality,requestedSize:requestedSize||null,effectiveSize:effectiveSize||requestedSize||null,outputImageEstimate,referenceImageInputEstimate,promptTextEstimate,visionEstimate,estimatedTotalMin,estimatedTotalMax,estimatedImageCost:outputImageEstimate,imageGenerationCallCount:photoCalls,requiresAdditionalConfirmation:estimatedTotalMax>.30,strongWarning:estimatedTotalMax>.60,image:{calls:photoCalls,model:"gpt-image-2",endpoint:roles.length?"/v1/images/edits":"/v1/images/generations",quality:config.quality,n:photoCalls?1:0,referenceImageCount:roles.length,referenceRoles:roles,retries,usage:imageUsage,estimatedEur:outputImageEstimate},vision:{calls:visionCalls,model:"gpt-4o-mini",usage:visionUsage||null,estimatedEur:visionEstimate},text:{calls:textUsage?1:0,usage:textUsage||null,estimatedEurRange:promptTextEstimate}};
}
module.exports={COST_MODES,UNKNOWN_REFERENCE_INPUT_MAX_EUR,PROMPT_TEXT_MAX_EUR,costMode,selectedReferenceRoles,buildCostAudit};
