"use strict";

// SceneIntent is the visual authority; service facts remain in the contract.
function projectNarrativePlan({subjectBrief,posterStrategy,legacyProjection,artDirection,sceneIntent,contract}){
 if(sceneIntent.mode!=="narrative_consequence"||contract.generic)return {subjectBrief,posterStrategy,legacyProjection,artDirection};
 const {before,moment,after}=sceneIntent.transformation;
 const primary=subjectBrief.forbidsPeople?"Le paysage et ses volumes incarnent le sujet demandé":subjectBrief.visualPrimarySubject;
 const subject=Object.freeze({...subjectBrief,physicalOrEmotionalManifestation:before,subjectVisualDirective:moment,
  dramaticMoment:moment,transformationPromise:after,visualPrimarySubject:primary,visualSecondarySubject:null,
  peoplePolicy:sceneIntent.peoplePolicy,scenePolicy:"La prestation est la cause invisible de la transformation.",
  visualProtectedAreas:["sujet principal",subjectBrief.requestedFocus,"ouverture narrative"].filter(Boolean)});
 const poster=Object.freeze({...posterStrategy,instantVisualMeaning:before,subjectManifestation:`${subjectBrief.exactUserRequest} : ${before}`,
  careOrSolutionManifestation:moment,transformationNarrative:after,mainSubject:primary,secondarySubject:null,
  tertiarySubject:null,visualHierarchy:[`${subjectBrief.exactUserRequest} : ${before}`,moment,after],protectedSceneAreas:subject.visualProtectedAreas,
  environmentRole:sceneIntent.environment,architecturalStory:sceneIntent.environment,
  metrics:{...posterStrategy.metrics,heuristic:true,validationStage:"before-image-generation"}});
 const projection=Object.freeze({...legacyProjection,ideeVisuelle:`${before} ${moment} Décor : ${sceneIntent.environment}`,sujetPrincipal:primary,
  sujetSecondaire:null,action:moment,pointDeTransformation:after,environmentRole:sceneIntent.environment,
  caracteristiquePrestationVisible:contract.recognition});
 const direction=Object.freeze({...artDirection,primarySubject:primary,secondarySubject:null,primaryAction:moment,
  story:`${before} ${moment} ${after}`,tensionResolution:after,protectedZones:subject.visualProtectedAreas});
 return {subjectBrief:subject,posterStrategy:poster,legacyProjection:projection,artDirection:direction};
}
module.exports={projectNarrativePlan};
