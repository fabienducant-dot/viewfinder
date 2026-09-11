"use strict";
const {finalizeV3}=require("./v3-pipeline");
const {assessQuality}=require("./v3-quality");

async function executeV3Pipeline({plan,rawImageBuffer,analyzeImage,composeImage,preserveRaw,brandComposition}){
 await preserveRaw(rawImageBuffer);
 let finalization;
 try{
  const actual=await analyzeImage(rawImageBuffer,plan);
  const lowerProtected=plan.artDirection.platform==="Story"&&(actual.protectedZones||[]).some(zone=>/bottom|inférieur|bas/i.test(String(zone)))&&!(actual.calmZones||[]).some(zone=>/bottom|inférieur|bas/i.test(String(zone)));
  finalization=finalizeV3(plan,actual,{imageExists:true,paletteDrift:actual.paletteDrift,contrastValid:actual.availableContrast>=.25,gazeHierarchyValid:true,thumbnailImpact:actual.density<.92,protectedCollision:lowerProtected});
 }catch(error){
  const failure=new Error("Analyse image V4 impossible : "+String(error.message||error));failure.code="V4_ANALYSIS_FAILED";throw failure;
 }
 try{
  const imageBuffer=await composeImage(rawImageBuffer,finalization.layout,brandComposition);
  const manifest=imageBuffer?.compositionManifest||null;
  if(!manifest||manifest.finalCompositionEngine!=="sharp-server")throw new Error("Manifeste Sharp serveur absent.");
  const measured=manifest;
  finalization={...finalization,compositionManifest:manifest,quality:assessQuality({contract:plan.contract,sceneIntent:plan.sceneIntent,analysis:finalization.analysis,composition:{imageExists:true,paletteDrift:finalization.analysis.paletteDrift,contrastValid:finalization.analysis.availableContrast>=.25,gazeHierarchyValid:measured.hierarchyValid!==false,thumbnailImpact:finalization.analysis.density<.92,logoIntegrity:measured.logoWithinCanvas!==false,logoAssetIntegrity:measured.logoAssetIntegrity!==false,logoFringeDetected:measured.logoFringeDetected===true,logoScaleValid:measured.logoScaleValid!==false,marginsValid:measured.marginsValid!==false,textWithinCanvas:measured.textWithinCanvas!==false&&measured.titleExact!==false&&measured.subtitleExact!==false,protectedCollision:measured.zonesDisjoint===false,logoRectangleOpaque:measured.logoRectangleOpaque===true}})};
  return {imageBuffer,brandComposited:true,finalCompositionEngine:"sharp-server",finalization};
 }catch(error){
  const failure=new Error("Composition Sharp V4 impossible : "+String(error.message||error));failure.code="V4_SHARP_COMPOSITION_FAILED";failure.finalization=finalization;throw failure;
 }
}
module.exports={executeV3Pipeline};
