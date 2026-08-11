"use strict";
const COST_MODES=Object.freeze({
 test:{id:"test",label:"MODE TEST — une photographie économique pour valider la scène et le layout",quality:"low",imageCalls:1,n:1,automaticRetries:0,estimatedPhotoEur:.18,estimatedVisionEur:.01},
 production:{id:"production",label:"MODE PRODUCTION — photographie finale haute qualité",quality:"high",imageCalls:1,n:1,automaticRetries:0,estimatedPhotoEur:.72,estimatedVisionEur:.01},
 recompose:{id:"recompose",label:"RECOMPOSER L’AFFICHE EXISTANTE — AUCUN COÛT IMAGE",quality:null,imageCalls:0,n:0,automaticRetries:0,estimatedPhotoEur:0,estimatedVisionEur:0},
});
function costMode(id){const mode=COST_MODES[id]||COST_MODES.test;return {...mode,requiresConfirmation:mode.estimatedPhotoEur>.30,strongWarning:mode.estimatedPhotoEur>.60};}
function buildCostAudit({mode="test",referenceImageCount=0,imageUsage=null,visionUsage=null,textUsage=null,retries=0,imageCalls}={}){const config=costMode(mode);const photoCalls=imageCalls??config.imageCalls;const visionCalls=config.id==="recompose"||visionUsage===false?0:1;return {mode:config.id,estimateNotInvoice:true,image:{calls:photoCalls,model:"gpt-image-2",endpoint:referenceImageCount?"/v1/images/edits":"/v1/images/generations",quality:config.quality,n:photoCalls?1:0,referenceImageCount,retries,usage:imageUsage,estimatedEur:photoCalls?config.estimatedPhotoEur:0},vision:{calls:visionCalls,model:"gpt-4o-mini",usage:visionUsage||null,estimatedEur:visionCalls?config.estimatedVisionEur:0},text:{calls:textUsage?1:0,usage:textUsage||null,estimatedEur:null},totalEstimatedEur:photoCalls?config.estimatedPhotoEur+config.estimatedVisionEur:0,requiresConfirmation:config.requiresConfirmation,strongWarning:config.strongWarning};}
module.exports={COST_MODES,costMode,buildCostAudit};
