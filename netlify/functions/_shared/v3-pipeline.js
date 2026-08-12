"use strict";
const crypto=require("crypto");
const {getServiceContract}=require("./v3-registry");
const {createArtDirectionBrief,buildPhotoBrief,publicPreflight}=require("./v3-art-direction");
const {analyzeActualImage,chooseLayout}=require("./v3-layout-engine");
const {assessQuality}=require("./v3-quality");
const {makeArtFingerprint}=require("./v3-art-worlds");
const {psioRequiredForContract,statusFromRecords}=require("./v3-psio-references");
function planIdentity(plan){return crypto.createHash("sha256").update(JSON.stringify({version:plan.version,service:plan.contract?.name,platform:plan.artDirection?.platform,creativeSeed:plan.artDirection?.creativeSeed,artSelection:plan.artSelection,photoPrompt:plan.photoBrief?.prompt,psioRequired:plan.psioRequired,psioReferenceIds:plan.psioReferenceIds,psioReferenceReady:plan.psioReferenceReady,costMode:plan.costMode})).digest("hex");}
function planV3(input){const contract=getServiceContract(input.service);const artDirection=createArtDirectionBrief(input);const required=psioRequiredForContract(contract),psio=statusFromRecords({},required);const plan={version:3,contract,artDirection,photoBrief:buildPhotoBrief(artDirection),preflight:publicPreflight(artDirection),artSelection:artDirection.artistic,costMode:input.costMode||"test",...psio};return Object.freeze({...plan,planId:planIdentity(plan)});}
function withPsioReferenceStatus(plan,status){const next={...plan,...status};delete next.planId;return Object.freeze({...next,planId:planIdentity(next)});}
function validatePreparedPlan(plan){if(!plan||plan.version!==3||!plan.contract?.name||!plan.artDirection||!plan.photoBrief?.prompt||!plan.artSelection)throw new Error("Plan V3 préparé incomplet.");if(plan.planId!==planIdentity(plan))throw new Error("Identifiant du plan artistique invalide : préparez de nouveau la création.");return plan;}
function finalizeV3(plan,imageAnalysis,composition){const analysis=analyzeActualImage(imageAnalysis);const layout=chooseLayout({platform:plan.artDirection.platform,contract:plan.contract,analysis});const quality=assessQuality({contract:plan.contract,analysis,composition});return {analysis,layout,quality};}
function artisticFingerprint(plan,finalization,status){return makeArtFingerprint({service:plan.contract.name,platform:plan.artDirection.platform,layout:finalization?.layout,selection:plan.artSelection,artDirection:plan.artDirection,status});}
module.exports={planV3,withPsioReferenceStatus,planIdentity,validatePreparedPlan,finalizeV3,artisticFingerprint};
