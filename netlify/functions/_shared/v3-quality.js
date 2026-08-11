"use strict";
function includesAny(values,terms){const hay=(values||[]).join(" ").toLowerCase();return terms.split(/,|;/).map(x=>x.trim().toLowerCase()).filter(Boolean).some(x=>hay.includes(x));}
function assessQuality({contract,analysis={},composition={}}){
 const technical=[],business=[],artistic=[],warnings=[];
 if(!composition.imageExists)technical.push("image_absente");
 if(analysis.parasites?.some(x=>/texte|logo|signature|url|cta/i.test(x)))technical.push("texte_parasite");
 if(composition.logoIntegrity===false)technical.push("logo_incomplet");
 if(composition.marginsValid===false)technical.push("marges_invalides");
 if(composition.textWithinCanvas===false)technical.push("texte_hors_cadre_ou_coupe");
 if(composition.protectedCollision===true)technical.push("collision_zone_protegee");
 if(composition.logoRectangleOpaque===true)technical.push("rectangle_opaque_autour_logo");
 if(Number(analysis.identityCount??analysis.peopleCount)!==contract.uniqueIdentityCount)business.push("nombre_identites");
 if(analysis.businessCompliance===false)business.push("prestation_non_reconnaissable");
 if(!analysis.requiredActionVisible)business.push("geste_obligatoire");
 if(includesAny(analysis.equipment,contract.forbiddenEquipment)||includesAny(analysis.equipment,contract.forbiddenAccessories))business.push("objet_interdit_ou_invente");
 const stages=analysis.compositeStages||[];if(contract.type==="offre composite"&&stages.length<contract.requiredCompositeStages.length)business.push("offre_composite_incomplete");
 if(contract.type==="offre composite"&&analysis.sameBeneficiary!==true)business.push("beneficiaire_non_continu");
 if(contract.type==="offre composite"&&analysis.samePractitioner!==true)business.push("praticien_non_continu");
 if(contract.type==="offre composite"&&analysis.foreignPersonPresent===true)business.push("troisieme_identite_etrangere");
 if(contract.practitionerGenderRequired&&analysis.practitionerGender!==contract.practitionerGender)business.push("Praticien masculin obligatoire non reconnu");
 const paletteDrift=Number(composition.paletteDrift??analysis.paletteDrift??0);
 if(paletteDrift>0.45)artistic.push("derive_palette_importante");else if(paletteDrift>0.15)warnings.push("derive_ambre_moderee_corrigeable");
 if(composition.contrastValid===false)artistic.push("contraste");if(composition.gazeHierarchyValid===false)artistic.push("hierarchie_regard");if(composition.thumbnailImpact===false)artistic.push("impact_miniature");
 return {ok:technical.length===0&&business.length===0&&artistic.length===0,technical:{ok:!technical.length,errors:technical},business:{ok:!business.length,errors:business},artistic:{ok:!artistic.length,errors:artistic},warnings,preserveRawImage:true,preservePostText:true};
}
module.exports={assessQuality};
