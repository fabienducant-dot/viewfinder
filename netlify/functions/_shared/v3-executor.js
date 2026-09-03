"use strict";
const {finalizeV3}=require("./v3-pipeline");
const {assessQuality}=require("./v3-quality");

async function executeV3Pipeline({plan,rawImageBuffer,analyzeImage,composeImage,preserveRaw,brandComposition}){
 await preserveRaw(rawImageBuffer);
 let finalization;
 try{
  const actual=await analyzeImage(rawImageBuffer,plan);
  const lowerProtected=plan.artDirection.platform==="Story"&&(actual.protectedZones||[]).some(zone=>/bottom|inférieur|bas/i.test(String(zone)))&&!(actual.calmZones||[]).some(zone=>/bottom|inférieur|bas/i.test(String(zone)));
  // Avant Sharp, on ne prétend plus connaître l'état du logo : seuls les pixels de la scène sont évalués.
  finalization=finalizeV3(plan,actual,{
   imageExists:true,
   paletteDrift:actual.paletteDrift,
   contrastValid:actual.availableContrast>=.25,
   gazeHierarchyValid:true,
   thumbnailImpact:actual.density<.92,
   protectedCollision:lowerProtected,
  });
 }catch(error){
  return {imageBuffer:rawImageBuffer,brandComposited:false,finalization:{analysis:null,layout:null,quality:{ok:false,mode:plan.sceneIntent?.mode||"legacy",technical:{ok:false,errors:["analyse_image_indisponible"]},business:{ok:false,errors:["conformite_visuelle_non_verifiee"]},artistic:{ok:false,errors:[]},warnings:[],preserveRawImage:true,preservePostText:true},error:String(error.message||error)}};
 }
 if(!finalization.quality.ok)return {imageBuffer:rawImageBuffer,brandComposited:false,finalization};
 try{
  const imageBuffer=await composeImage(rawImageBuffer,finalization.layout,brandComposition);
  const manifest=imageBuffer?.compositionManifest||null;
  const measured=manifest||{};
  finalization={...finalization,compositionManifest:manifest,quality:assessQuality({
   contract:plan.contract,
   sceneIntent:plan.sceneIntent,
   analysis:finalization.analysis,
   composition:{
    imageExists:true,
    paletteDrift:finalization.analysis.paletteDrift,
    contrastValid:finalization.analysis.availableContrast>=.25,
    gazeHierarchyValid:measured.hierarchyValid!==false,
    thumbnailImpact:finalization.analysis.density<.92,
    logoIntegrity:measured.logoWithinCanvas!==false,
    logoAssetIntegrity:measured.logoAssetIntegrity!==false,
    logoFringeDetected:measured.logoFringeDetected===true,
    logoScaleValid:measured.logoScaleValid!==false,
    marginsValid:measured.marginsValid!==false,
    textWithinCanvas:measured.textWithinCanvas!==false&&measured.titleExact!==false&&measured.subtitleExact!==false,
    protectedCollision:measured.zonesDisjoint===false,
    logoRectangleOpaque:measured.logoRectangleOpaque===true,
   }
  })};
  return {imageBuffer,brandComposited:true,finalization};
 }catch(error){
  finalization={...finalization,quality:{...finalization.quality,ok:false,technical:{ok:false,errors:[...finalization.quality.technical.errors,"composition_sharp"]}},error:String(error.message||error)};
  return {imageBuffer:rawImageBuffer,brandComposited:false,finalization};
 }
}
module.exports={executeV3Pipeline};
