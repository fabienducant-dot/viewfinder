"use strict";
const {getServiceContract}=require("./v3-registry");
const {createArtDirectionBrief,buildPhotoBrief,publicPreflight}=require("./v3-art-direction");
const {analyzeActualImage,chooseLayout}=require("./v3-layout-engine");
const {assessQuality}=require("./v3-quality");
function planV3(input){const contract=getServiceContract(input.service);const artDirection=createArtDirectionBrief(input);return {version:3,contract,artDirection,photoBrief:buildPhotoBrief(artDirection),preflight:publicPreflight(artDirection)};}
function finalizeV3(plan,imageAnalysis,composition){const analysis=analyzeActualImage(imageAnalysis);const layout=chooseLayout({platform:plan.artDirection.platform,contract:plan.contract,analysis});const quality=assessQuality({contract:plan.contract,analysis,composition});return {analysis,layout,quality};}
module.exports={planV3,finalizeV3};
