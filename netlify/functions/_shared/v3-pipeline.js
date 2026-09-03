"use strict";
const crypto=require("crypto");
const {getServiceContract}=require("./v3-registry");
const {createArtDirectionBrief,buildPhotoBrief,publicPreflight}=require("./v3-art-direction");
const {analyzeActualImage,chooseLayout}=require("./v3-layout-engine");
const {assessQuality}=require("./v3-quality");
const {makeArtFingerprint}=require("./v3-art-worlds");
const {psioRequiredForContract,statusFromRecords}=require("./v3-psio-references");
const {inferSubjectBrief,buildPosterStrategy,buildLegacyProjection,relevanceScores,buildPostCopyStrategy,buildCampaignCreativeDirection}=require("./v3-creative-strategy");
const {buildConsistencyReport}=require("./v3-consistency-control");
function planIdentity(plan){return crypto.createHash("sha256").update(JSON.stringify({version:plan.version,service:plan.contract?.name,platform:plan.artDirection?.platform,creativeSeed:plan.artDirection?.creativeSeed,artSelection:plan.artSelection,subjectBrief:plan.subjectBrief,posterStrategy:plan.posterStrategy,legacyProjection:plan.legacyProjection,postCopyStrategy:plan.postCopyStrategy,campaignCreativeDirection:plan.campaignCreativeDirection,consistencyReport:plan.consistencyReport,photoPrompt:plan.photoBrief?.prompt,psioRequired:plan.psioRequired,psioReferenceIds:plan.psioReferenceIds,psioReferenceReady:plan.psioReferenceReady,costMode:plan.costMode})).digest("hex");}
function withProfessionalBodyworkSafety(photoBrief,contract){
 const type=String(contract?.type||"").toLowerCase();
 const bodywork=/massage|drainage|réflexologie/.test(type);
 if(!bodywork||!photoBrief?.prompt)return photoBrief;
 const framing=contract?.name==="Massage Enfant"
  ?"CADRE PROFESSIONNEL PROTECTEUR — Enfant entièrement vêtu, parent clairement visible, praticien professionnel, contact uniquement à travers les vêtements sur les zones prévues, contexte familial et de bien-être explicite."
  :"CADRE PROFESSIONNEL ET PUDIQUE — Tous les sujets humains sont des adultes. Scène de bien-être strictement professionnelle. Le bénéficiaire reste vêtu ou couvert par un drap de soin opaque ; seule la zone strictement nécessaire au geste est visible. Postures neutres et naturelles, contexte de cabinet explicite, aucune mise en scène romantique.";
 if(photoBrief.prompt.includes(framing))return photoBrief;
 const marker="\n\nMOMENT DRAMATIQUE / TRANSFORMATION";
 const prompt=photoBrief.prompt.includes(marker)
  ?photoBrief.prompt.replace(marker,`\n\n${framing}${marker}`)
  :`${framing}\n\n${photoBrief.prompt}`;
 return Object.freeze({...photoBrief,prompt});
}
function planV3(input){const contract=getServiceContract(input.service);const subjectBrief=inferSubjectBrief({subject:input.subject,selectedRegisters:input.selectedRegisters||input.registres,service:contract.name,marketingObjective:input.marketingObjective,contract});const inferredArtKey=input.artDirectionKey||(!subjectBrief.spatialAuthority&&subjectBrief.editorialKind==="institutional"?"cabinet_cinematographique":null);const artDirection=createArtDirectionBrief({...input,subjectBrief,artDirectionKey:inferredArtKey});const posterStrategy=buildPosterStrategy({subjectBrief,contract,artDirection,platform:input.platform,textChoice:input.textChoice});const legacyProjection=buildLegacyProjection({subjectBrief,posterStrategy,artDirection,contract});const freeScores=relevanceScores(subjectBrief,posterStrategy,contract);if(!freeScores.ready)throw new Error("Plan visuel trop générique ou sujet insuffisamment incarné — reconstruction gratuite requise.");const postCopyStrategy=buildPostCopyStrategy({platform:input.platform,subjectBrief,posterStrategy,contract,history:input.copyHistory||[]});const campaignCreativeDirection=buildCampaignCreativeDirection({posterStrategy,postCopyStrategy,contract});const photoBrief=withProfessionalBodyworkSafety(buildPhotoBrief(artDirection,{subjectBrief,posterStrategy}),contract);const consistencyReport=buildConsistencyReport({contract,subjectBrief,posterStrategy,artDirection,photoBrief,legacyProjection,postCopyStrategy,campaignCreativeDirection,platform:input.platform});if(!consistencyReport.ready)throw new Error(`Plan V3 incohérent — recomposition gratuite requise : ${consistencyReport.blockingReasons.join(", ")}`);const required=psioRequiredForContract(contract),psio=statusFromRecords({},required);const plan={version:3,contract,subjectBrief,posterStrategy,legacyProjection,postCopyStrategy,campaignCreativeDirection,consistencyReport,freeScores,artDirection,photoBrief,preflight:{...publicPreflight(artDirection),subjectBrief,posterStrategy,postCopyStrategy,campaignCreativeDirection,consistencyReport,freeScores},artSelection:artDirection.artistic,costMode:input.costMode||"test",...psio};return Object.freeze({...plan,planId:planIdentity(plan)});}
function withPsioReferenceStatus(plan,status){const next={...plan,...status};delete next.planId;return Object.freeze({...next,planId:planIdentity(next)});}
function validatePreparedPlan(plan){if(!plan||plan.version!==3||!plan.contract?.name||!plan.artDirection||!plan.photoBrief?.prompt||!plan.artSelection)throw new Error("Plan V3 préparé incomplet.");if(plan.planId!==planIdentity(plan))throw new Error("Identifiant du plan artistique invalide : préparez de nouveau la création.");return plan;}
function finalizeV3(plan,imageAnalysis,composition){const analysis=analyzeActualImage(imageAnalysis);const layout=chooseLayout({platform:plan.artDirection.platform,contract:plan.contract,analysis});const quality=assessQuality({contract:plan.contract,analysis,composition});return {analysis,layout,quality};}
function artisticFingerprint(plan,finalization,status){return makeArtFingerprint({service:plan.contract.name,platform:plan.artDirection.platform,layout:finalization?.layout,selection:plan.artSelection,artDirection:plan.artDirection,status});}
module.exports={planV3,withPsioReferenceStatus,planIdentity,validatePreparedPlan,finalizeV3,artisticFingerprint};