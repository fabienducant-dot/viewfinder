"use strict";
const {getServiceContract}=require("./v3-registry");
const {createArtDirectionBrief,buildPhotoBrief,publicPreflight}=require("./v3-art-direction");
const {analyzeActualImage,chooseLayout}=require("./v3-layout-engine");
const {assessQuality}=require("./v3-quality");
const {makeArtFingerprint}=require("./v3-art-worlds");
function planV3(input){const contract=getServiceContract(input.service);const artDirection=createArtDirectionBrief(input);return {version:3,contract,artDirection,photoBrief:buildPhotoBrief(artDirection),preflight:publicPreflight(artDirection),artSelection:artDirection.artistic};}
function finalizeV3(plan,imageAnalysis,composition){const analysis=analyzeActualImage(imageAnalysis);const layout=chooseLayout({platform:plan.artDirection.platform,contract:plan.contract,analysis});const quality=assessQuality({contract:plan.contract,analysis,composition});return {analysis,layout,quality};}
function artisticFingerprint(plan,finalization,status){return makeArtFingerprint({service:plan.contract.name,platform:plan.artDirection.platform,layout:finalization?.layout,selection:plan.artSelection,artDirection:plan.artDirection,status});}
module.exports={planV3,finalizeV3,artisticFingerprint};
