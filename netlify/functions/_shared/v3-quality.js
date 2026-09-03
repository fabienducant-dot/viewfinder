"use strict";

function includesAny(values,terms){const hay=(values||[]).join(" ").toLowerCase();return terms.split(/,|;/).map(x=>x.trim().toLowerCase()).filter(Boolean).some(x=>hay.includes(x));}
function observed(analysis,name){return (analysis.observedRegisters||[]).map(x=>String(x).toLowerCase()).includes(name);}
function implicitMode(contract){
 if(contract?.type==="offre composite")return "composite_fidelity";
 if(contract?.name==="Luminothérapie PSIO®"||contract?.name==="Biorésonance quantique")return "product_fidelity";
 return "legacy";
}

function assessQuality({contract,sceneIntent=null,analysis={},composition={},nonRedundancy={},cost={}}){
 const technical=[],business=[],artistic=[],warnings=[];
 const mode=sceneIntent?.mode||implicitMode(contract),validation=sceneIntent?.validation||{};

 if(!composition.imageExists)technical.push("image_absente");
 if(analysis.parasites?.some(x=>/texte|logo|signature|url|cta|pictogramme/i.test(x)))technical.push("texte_ou_marque_parasite_dans_photo_brute");
 if(composition.logoIntegrity===false)technical.push("logo_incomplet");
 if(composition.logoAssetIntegrity===false)technical.push("actif_logo_invalide");
 if(composition.logoFringeDetected===true)technical.push("halo_ou_residu_autour_logo");
 if(composition.logoScaleValid===false)technical.push("logo_hors_echelle_autorisee");
 if(composition.marginsValid===false)technical.push("marges_invalides");
 if(composition.textWithinCanvas===false)technical.push("texte_hors_cadre_ou_coupe");
 if(composition.protectedCollision===true)technical.push("collision_zone_protegee");
 if(composition.logoRectangleOpaque===true)technical.push("rectangle_opaque_autour_logo");

 if(analysis.subjectMatchesRequest===false)business.push("sujet_utilisateur_non_reconnaissable");
 if(mode==="demonstration"||mode==="legacy"){
  if(Number(analysis.identityCount??analysis.peopleCount)!==contract.uniqueIdentityCount)business.push("nombre_identites");
  if(analysis.businessCompliance===false)business.push("prestation_non_reconnaissable");
  if(!analysis.requiredActionVisible)business.push("geste_obligatoire");
  if(contract.practitionerGenderRequired&&analysis.practitionerGender!==contract.practitionerGender)business.push("Praticien masculin obligatoire non reconnu");
 }
 if(mode==="composite_fidelity"){
  const stages=analysis.compositeStages||[];
  if(Number(analysis.identityCount??analysis.peopleCount)!==contract.uniqueIdentityCount)business.push("nombre_identites");
  if(analysis.businessCompliance===false)business.push("prestation_non_reconnaissable");
  if(stages.length<contract.requiredCompositeStages.length)business.push("offre_composite_incomplete");
  if(analysis.sameBeneficiary!==true)business.push("beneficiaire_non_continu");
  if(analysis.samePractitioner!==true)business.push("praticien_non_continu");
  if(analysis.foreignPersonPresent===true)business.push("troisieme_identite_etrangere");
  if(contract.practitionerGenderRequired&&analysis.practitionerGender!==contract.practitionerGender)business.push("Praticien masculin obligatoire non reconnu");
 }
 if(mode==="product_fidelity"&&analysis.businessCompliance===false)business.push("prestation_non_reconnaissable");
 if(validation.requireProductFidelity&&analysis.productFidelity!==true)business.push("fidelite_produit_non_verifiee");
 if(includesAny(analysis.equipment,contract.forbiddenEquipment)||includesAny(analysis.equipment,contract.forbiddenAccessories))business.push("objet_interdit_ou_invente");

 if(validation.requireDramaticMoment&&analysis.dramaticMomentPresent!==true)artistic.push("moment_dramatique_absent");
 if(validation.requireTransformation&&analysis.transformationReadable!==true)artistic.push("transformation_non_lisible");
 if(validation.requireCinematicPoster&&analysis.cinematicPosterRead!==true)artistic.push("lecture_affiche_cinema_absente");
 if(validation.requireThreePlanes&&analysis.threePlaneDepth!==true)artistic.push("profondeur_trois_plans_absente");
 if(validation.requireArchitecture&&(analysis.architectureObserved!==true||!observed(analysis,"architectural")))artistic.push("registre_architecture_non_visible");
 if(validation.requireFantastic&&(analysis.fantasticObserved!==true||!observed(analysis,"fantastic")))artistic.push("registre_fantastique_non_visible");
 if(validation.rejectGenericSpa&&Number(analysis.genericSpaRisk||0)>.35)artistic.push("risque_spa_generique");
 if(mode==="narrative_consequence"&&Number(analysis.literalTreatmentSceneRisk||0)>.65)artistic.push("illustration_litterale_du_soin");
 if(validation.requireCinematicPoster&&analysis.brandSafeZoneAvailable!==true)artistic.push("zone_branding_calme_absente");

 const paletteDrift=Number(composition.paletteDrift??analysis.paletteDrift??0);
 if(paletteDrift>.45)artistic.push("derive_palette_importante");else if(paletteDrift>.15)warnings.push("derive_palette_moderee_corrigeable");
 if(composition.contrastValid===false)artistic.push("contraste_insuffisant");
 if(composition.gazeHierarchyValid===false)artistic.push("hierarchie_regard");
 if(composition.thumbnailImpact===false)artistic.push("impact_miniature");

 const nonRedundancyErrors=nonRedundancy.tooSimilar?["combinaison_artistique_trop_proche"]:[],allErrors=[...technical,...business,...artistic,...nonRedundancyErrors];
 const visualHeuristics={heuristic:true,notCertainty:true,subjectImmediatelyUnderstandable:analysis.subjectMatchesRequest!==false,dramaticMoment:analysis.dramaticMomentPresent===true,transformationReadable:analysis.transformationReadable===true,cinematicPosterRead:analysis.cinematicPosterRead===true,threePlaneDepth:analysis.threePlaneDepth===true,emotionalStrength:Math.round(((analysis.dramaticMomentPresent?.45:0)+(analysis.transformationReadable?.35:0)+(composition.thumbnailImpact===false?0:.2))*10),sceneQuality:Math.round(Number(analysis.availableContrast||.7)*10),mobileReadability:composition.thumbnailImpact===false?4:8,officialLogoVisible:composition.logoIntegrity!==false&&composition.logoFringeDetected!==true,textHierarchy:composition.gazeHierarchyValid===false?4:8,sdzConsistency:paletteDrift>.45?3:(Number(analysis.genericSpaRisk||0)>.35?5:9),genericRisk:Math.max(Number(analysis.genericSpaRisk||0),Number(analysis.literalTreatmentSceneRisk||0)),overlapRisk:composition.protectedCollision===true?9:1,recommendedAction:technical.length?"recomposer_gratuitement":allErrors.length?"regenerer":"valider"};
 return {ok:allErrors.length===0,mode,technical:{ok:!technical.length,errors:technical},business:{ok:!business.length,errors:business},artistic:{ok:!artistic.length,errors:artistic},nonRedundancy:{ok:!nonRedundancyErrors.length,errors:nonRedundancyErrors,reason:nonRedundancy.reason||null},cost:{ok:cost.withinApprovedCeiling!==false,report:cost.report||null},visualHeuristics,warnings,preserveRawImage:true,preservePostText:true};
}
module.exports={assessQuality};
