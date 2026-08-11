"use strict";
const {PLATFORM_TEMPLATES,normalizePlatform}=require("./v3-layout-engine");
const CAMPAIGN_FORMATS=Object.freeze(["Instagram Square","Instagram Portrait","Facebook","Story","Google Business","Blog","Bannière"]);
function cropPosition(analysis={}){const zones=analysis.calmZones||[];if(zones.some(x=>/left/i.test(x)))return "left";if(zones.some(x=>/right/i.test(x)))return "right";if(zones.some(x=>/top/i.test(x)))return "top";if(zones.some(x=>/bottom/i.test(x)))return "bottom";return "attention";}
function compatibilityMatrix(analysis={}){return Object.fromEntries(CAMPAIGN_FORMATS.map(platform=>{const t=PLATFORM_TEMPLATES[normalizePlatform(platform)];const horizontal=t.width/t.height>1.7;const sourceVertical=analysis.sourceWidth&&analysis.sourceHeight&&analysis.sourceHeight/analysis.sourceWidth>1.5;const protectedDense=(analysis.protectedZones||[]).length>5;const possible=!(horizontal&&sourceVertical&&protectedDense);return [platform,{platformAdaptationPossible:possible,reason:possible?"Recadrage Sharp depuis la photographie maîtresse, sans étirement.":"Source verticale trop dense pour un recadrage horizontal sûr ; aucune nouvelle photo sans confirmation.",target:{width:t.width,height:t.height},cropPosition:cropPosition(analysis)}];}));}
async function runMasterCampaign({generateMaster,analyzeMaster,composePlatform,formats=CAMPAIGN_FORMATS}){
 const masterRawImage=await generateMaster();
 const masterImageAnalysis=await analyzeMaster(masterRawImage);
 const matrix=compatibilityMatrix(masterImageAnalysis);const outputs={};
 for(const platform of formats){const decision=matrix[platform];outputs[platform]=decision.platformAdaptationPossible?await composePlatform({platform,masterRawImage,masterImageAnalysis,decision}):{refused:true,...decision};}
 return {masterRawImage,masterImageAnalysis,outputs,counters:{imageGenerationCalls:1,visionCalls:1,platformCompositions:formats.length}};
}
async function recomposeMasterCampaign({masterRawImage,masterImageAnalysis,composePlatform,formats=CAMPAIGN_FORMATS}){
 const matrix=compatibilityMatrix(masterImageAnalysis);const outputs={};
 for(const platform of formats){const decision=matrix[platform];outputs[platform]=decision.platformAdaptationPossible?await composePlatform({platform,masterRawImage,masterImageAnalysis,decision}):{refused:true,...decision};}
 return {masterRawImage,masterImageAnalysis,outputs,counters:{imageGenerationCalls:0,visionCalls:0,platformCompositions:formats.length}};
}
module.exports={CAMPAIGN_FORMATS,cropPosition,compatibilityMatrix,runMasterCampaign,recomposeMasterCampaign};
