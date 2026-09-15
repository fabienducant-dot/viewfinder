"use strict";
const {planV3,validatePreparedPlan}=require("./v3-pipeline");
const {normalizePlatform}=require("./v3-layout-engine");

function targetCampaignPlan(source,platform,target){
 const normalized=normalizePlatform(platform);
 if(target){
  validatePreparedPlan(target);
  if(normalizePlatform(target.artDirection.platform)!==normalized||target.contract.name!==source.contract.name||
     target.subjectBrief.exactUserRequest!==source.subjectBrief.exactUserRequest)
   throw new Error("Le plan cible ne correspond pas au sujet, à la prestation ou au format de cette campagne.");
  return target;
 }
 if(normalizePlatform(source.artDirection.platform)===normalized)return source;
 // Old saved campaigns also receive target-specific text rules, especially Google.
 return planV3({service:source.contract.name,platform:normalized,subject:source.subjectBrief.exactUserRequest,
  selectedRegisters:source.subjectBrief.selectedRegisters,marketingObjective:source.subjectBrief.marketingObjective,
  creativeSeed:source.artDirection.creativeSeed,artDirectionKey:source.artSelection.sceneKey,textChoice:"automatic"});
}
module.exports={targetCampaignPlan};
