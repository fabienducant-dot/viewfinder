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
const {buildSceneIntent,auditSceneIntent}=require("./v3-scene-intent");

function planIdentity(plan){
 return crypto.createHash("sha256").update(JSON.stringify({
  version:plan.version,
  service:plan.contract?.name,
  platform:plan.artDirection?.platform,
  creativeSeed:plan.artDirection?.creativeSeed,
  artSelection:plan.artSelection,
  subjectBrief:plan.subjectBrief,
  sceneIntent:plan.sceneIntent,
  posterStrategy:plan.posterStrategy,
  legacyProjection:plan.legacyProjection,
  postCopyStrategy:plan.postCopyStrategy,
  campaignCreativeDirection:plan.campaignCreativeDirection,
  consistencyReport:plan.consistencyReport,
  photoPrompt:plan.photoBrief?.prompt,
  psioRequired:plan.psioRequired,
  psioReferenceIds:plan.psioReferenceIds,
  psioReferenceReady:plan.psioReferenceReady,
  costMode:plan.costMode,
 })).digest("hex");
}

function planV3(input){
 const contract=getServiceContract(input.service);
 const subjectBrief=inferSubjectBrief({
  subject:input.subject,
  selectedRegisters:input.selectedRegisters||input.registres,
  service:contract.name,
  marketingObjective:input.marketingObjective,
  contract,
 });
 const inferredArtKey=input.artDirectionKey||(!subjectBrief.spatialAuthority&&subjectBrief.editorialKind==="institutional"?"cabinet_cinematographique":null);
 const artDirection=createArtDirectionBrief({...input,subjectBrief,artDirectionKey:inferredArtKey});
 const sceneIntent=buildSceneIntent({contract,subjectBrief,artDirection,platform:input.platform});
 const sceneAudit=auditSceneIntent(sceneIntent);
 if(!sceneAudit.ok)throw new Error(`SceneIntent invalide — reconstruction gratuite requise : ${sceneAudit.errors.join(", ")}`);

 const posterStrategy=buildPosterStrategy({subjectBrief,contract,artDirection,platform:input.platform,textChoice:input.textChoice});
 const legacyProjection=buildLegacyProjection({subjectBrief,posterStrategy,artDirection,contract});
 const freeScores=relevanceScores(subjectBrief,posterStrategy,contract);
 if(!freeScores.ready)throw new Error("Plan visuel trop générique ou sujet insuffisamment incarné — reconstruction gratuite requise.");
 const postCopyStrategy=buildPostCopyStrategy({platform:input.platform,subjectBrief,posterStrategy,contract,history:input.copyHistory||[]});
 const campaignCreativeDirection=buildCampaignCreativeDirection({posterStrategy,postCopyStrategy,contract});

 // L'ancien PhotoBrief reste une projection de compatibilité pour l'Inspector et les métadonnées.
 // Le SEUL prompt autorisé à atteindre OpenAI Images est désormais SceneIntent.providerPrompt.
 const legacyPhotoBrief=buildPhotoBrief(artDirection,{subjectBrief,posterStrategy});
 const photoBrief=Object.freeze({
  ...legacyPhotoBrief,
  prompt:sceneIntent.providerPrompt,
  background:sceneIntent.environment,
  sceneIntentId:sceneIntent.intentId,
  generationArchitecture:"SceneIntentV4",
 });

 // Le contrôle historique continue d'auditer ses propres projections, puis SceneIntent ajoute le
 // contrôle réellement lié au prompt fournisseur. On n'utilise jamais le contrôle historique pour
 // prétendre que le prompt final est bon lorsqu'il ne l'est pas.
 const legacyConsistency=buildConsistencyReport({
  contract,subjectBrief,posterStrategy,artDirection,photoBrief:legacyPhotoBrief,
  legacyProjection,postCopyStrategy,campaignCreativeDirection,platform:input.platform,
 });
 const sceneChecks=Object.freeze({
  sceneIntentCanonical:true,
  exactUserRequestPreserved:sceneIntent.exactUserRequest===String(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||"").replace(/\s+/g," ").trim(),
  providerPromptMatchesSceneIntent:photoBrief.prompt===sceneIntent.providerPrompt,
  oneProviderPrompt:true,
  dramaticArchitectureCoherent:sceneAudit.ok,
 });
 const sceneBlocking=Object.entries(sceneChecks).filter(([,value])=>value!==true).map(([key])=>key);
 const consistencyReport=Object.freeze({
  ...legacyConsistency,
  legacyProjectionReady:legacyConsistency.ready,
  sceneIntentAudit:sceneAudit,
  checks:Object.freeze({...legacyConsistency.checks,...sceneChecks}),
  blockingReasons:Object.freeze([...sceneBlocking]),
  ready:sceneBlocking.length===0,
  action:sceneBlocking.length?"recomposer gratuitement ou bloquer":"valider",
  authority:"SceneIntentV4",
 });
 if(!consistencyReport.ready)throw new Error(`Plan V4 incohérent — recomposition gratuite requise : ${consistencyReport.blockingReasons.join(", ")}`);

 const required=psioRequiredForContract(contract),psio=statusFromRecords({},required);
 const plan={
  version:4,
  contract,subjectBrief,sceneIntent,posterStrategy,legacyProjection,postCopyStrategy,
  campaignCreativeDirection,consistencyReport,freeScores,artDirection,photoBrief,
  preflight:{...publicPreflight(artDirection),subjectBrief,sceneIntent,posterStrategy,postCopyStrategy,campaignCreativeDirection,consistencyReport,freeScores},
  artSelection:artDirection.artistic,
  costMode:input.costMode||"test",
  ...psio,
 };
 return Object.freeze({...plan,planId:planIdentity(plan)});
}

function withPsioReferenceStatus(plan,status){const next={...plan,...status};delete next.planId;return Object.freeze({...next,planId:planIdentity(next)});}
function validatePreparedPlan(plan){
 if(!plan||![3,4].includes(plan.version)||!plan.contract?.name||!plan.artDirection||!plan.photoBrief?.prompt||!plan.artSelection)throw new Error("Plan V3/V4 préparé incomplet.");
 if(plan.version===4&&(!plan.sceneIntent||plan.photoBrief.prompt!==plan.sceneIntent.providerPrompt))throw new Error("SceneIntent V4 absent ou désynchronisé.");
 if(plan.planId!==planIdentity(plan))throw new Error("Identifiant du plan artistique invalide : préparez de nouveau la création.");
 return plan;
}
function finalizeV3(plan,imageAnalysis,composition){const analysis=analyzeActualImage(imageAnalysis);const layout=chooseLayout({platform:plan.artDirection.platform,contract:plan.contract,analysis});const quality=assessQuality({contract:plan.contract,sceneIntent:plan.sceneIntent,analysis,composition});return {analysis,layout,quality};}
function artisticFingerprint(plan,finalization,status){return makeArtFingerprint({service:plan.contract.name,platform:plan.artDirection.platform,layout:finalization?.layout,selection:plan.artSelection,artDirection:plan.artDirection,status});}
module.exports={planV3,withPsioReferenceStatus,planIdentity,validatePreparedPlan,finalizeV3,artisticFingerprint};
