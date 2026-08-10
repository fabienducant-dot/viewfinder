"use strict";
const { getServiceContract } = require("./v3-registry");

const ART_DIRECTION_FIELDS=["marketingObjective","audience","centralIdea","dominantEmotion","story","tensionResolution","primarySubject","secondarySubject","primaryAction","foreground","mainPlane","secondaryPlane","background","depth","breathingZone","protectedZones","leadingLines","massBalance","movementDirection","keyLight","fillLight","colorDominant","contrast","photoStyle","focalLength","cameraDistance","cameraHeight","cameraAngle","depthOfField","detailDensity","firstLook","secondLook","thirdLook","layoutFamily","consideredVariant","titlePosition","logoPosition","ctaPosition","layoutRationale"];

function createArtDirectionBrief({service,platform,marketingObjective="Faire réserver",audience="adultes recherchant un mieux-être",ctaAllowed=true}={}){
  const c=getServiceContract(service);
  return { service,platform,marketingObjective,audience,centralIdea:c.story,dominantEmotion:c.emotion,story:c.story,
    tensionResolution:"tension quotidienne vers un apaisement crédible",primarySubject:c.primarySubject,secondarySubject:c.secondarySubject,primaryAction:c.requiredAction,
    foreground:c.type==="offre composite"?c.requiredAction.split(",")[0]:"mains actives et geste métier",mainPlane:c.primarySubject,secondaryPlane:c.secondarySubject,background:"noir profond et or discret, contexte réel",
    depth:"trois plans lisibles",breathingZone:"zone calme opposée aux visages et mains",protectedZones:["visages","mains actives","matériel officiel"],leadingLines:"vers le geste obligatoire",massBalance:"sujet 60 %, respiration 40 %",movementDirection:"vers le centre de soin",keyLight:"lumière latérale douce",fillLight:"liseré or contrôlé",colorDominant:"noir et or",contrast:"fort mais détails visibles",photoStyle:"éditorial premium photoréaliste",focalLength:"50 mm",cameraDistance:"plan moyen",cameraHeight:"hauteur du geste",cameraAngle:"trois-quarts naturel",depthOfField:"modérée, étapes identifiables",detailDensity:c.detailLevel,firstLook:c.firstLook,secondLook:c.secondLook,thirdLook:c.thirdLook,layoutFamily:c.recommendedLayout,consideredVariant:`${c.recommendedLayout}-${platform}`,titlePosition:"zone calme déterminée après analyse",logoPosition:"lock-up dans marge sûre",ctaPosition:ctaAllowed?"sous le titre":"aucun",layoutRationale:`${c.recommendedLayout} rend lisibles ${c.firstLook}, puis ${c.secondLook}, puis ${c.thirdLook}.`};
}

function buildPhotoBrief(art){
  const c=getServiceContract(art.service);
  const referenceRule=c.referencePolicy;
  return Object.freeze({kind:"PhotoBrief",service:art.service,platform:art.platform,people:c.people,scene:art.story,planes:[art.foreground,art.mainPlane,art.secondaryPlane,art.background],negativeSpace:art.breathingZone,protectedZones:art.protectedZones,referencePolicy:referenceRule,
    prompt:`Photographie éditoriale premium destinée à être mise en page ultérieurement, noir et or, jamais 3D ni illustration. ${art.story}. Nombre obligatoire de personnes : ${c.people}. Action obligatoire : ${c.requiredAction}. Reconnaissance : ${c.recognition}. Matériel autorisé exclusivement : ${c.allowedEquipment}. Interdits : ${c.forbiddenEquipment}; ${c.forbiddenAccessories}. Tenue : ${c.outfit}. Position : ${c.position}. Préserver un espace négatif : ${art.breathingZone}. ${referenceRule}. SORTIE BRUTE OBLIGATOIRE : aucun texte, aucun logo, aucune signature, aucune adresse, aucun CTA, aucun pictogramme, aucun cadre graphique.`});
}
function publicPreflight(art){return {concept:art.centralIdea,layout:art.layoutFamily,justification:art.layoutRationale};}
module.exports={ART_DIRECTION_FIELDS,createArtDirectionBrief,buildPhotoBrief,publicPreflight};
