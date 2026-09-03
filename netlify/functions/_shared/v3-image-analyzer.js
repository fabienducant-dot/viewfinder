"use strict";

const ANALYSIS_SCHEMA={name:"viewfinder_v4_image_analysis",strict:true,schema:{type:"object",additionalProperties:false,properties:{
 faces:{type:"array",items:{type:"string"}},
 activeHands:{type:"array",items:{type:"string"}},
 equipment:{type:"array",items:{type:"string"}},
 subjects:{type:"array",items:{type:"string"}},
 gazeDirection:{type:"string"},
 protectedZones:{type:"array",items:{type:"string"}},
 calmZones:{type:"array",items:{type:"string"}},
 availableContrast:{type:"number"},
 density:{type:"number"},
 negativeSpace:{type:"array",items:{type:"string"}},
 peopleCount:{type:"integer"},
 identityCount:{type:"integer"},
 sameBeneficiary:{type:"boolean"},
 samePractitioner:{type:"boolean"},
 foreignPersonPresent:{type:"boolean"},
 practitionerGender:{type:"string",enum:["male","female","indeterminate","not_applicable"]},
 businessCompliance:{type:"boolean"},
 requiredActionVisible:{type:"boolean"},
 compositeStages:{type:"array",items:{type:"string"}},
 parasites:{type:"array",items:{type:"string"}},
 paletteDrift:{type:"number"},
 subjectMatchesRequest:{type:"boolean"},
 dramaticMomentPresent:{type:"boolean"},
 transformationReadable:{type:"boolean"},
 cinematicPosterRead:{type:"boolean"},
 threePlaneDepth:{type:"boolean"},
 genericSpaRisk:{type:"number"},
 literalTreatmentSceneRisk:{type:"number"},
 observedRegisters:{type:"array",items:{type:"string",enum:["cinematic","fantastic","architectural"]}},
 architectureObserved:{type:"boolean"},
 fantasticObserved:{type:"boolean"},
 brandSafeZoneAvailable:{type:"boolean"},
 productFidelity:{type:"boolean"},
},required:["faces","activeHands","equipment","subjects","gazeDirection","protectedZones","calmZones","availableContrast","density","negativeSpace","peopleCount","identityCount","sameBeneficiary","samePractitioner","foreignPersonPresent","practitionerGender","businessCompliance","requiredActionVisible","compositeStages","parasites","paletteDrift","subjectMatchesRequest","dramaticMomentPresent","transformationReadable","cinematicPosterRead","threePlaneDepth","genericSpaRisk","literalTreatmentSceneRisk","observedRegisters","architectureObserved","fantasticObserved","brandSafeZoneAvailable","productFidelity"]}};

async function analyzeImageWithOpenAI({key,imageBuffer,plan,fetchImpl=fetch}){
 if(!key)throw new Error("Clé OpenAI absente pour l'analyse V4.");
 const dataUrl=`data:image/png;base64,${imageBuffer.toString("base64")}`;
 const contract=plan.contract;
 const intent=plan.sceneIntent||null;
 const requestedRegisters=intent?.registers||{};
 const target=`Mode visuel : ${intent?.mode||"legacy"}. Demande exacte : ${intent?.exactUserRequest||plan.subjectBrief?.exactUserRequest||""}. Transformation : ${intent?.transformation?.before||""} → ${intent?.transformation?.moment||""} → ${intent?.transformation?.after||""}. Registres demandés : cinematic=${requestedRegisters.cinematic===true}, fantastic=${requestedRegisters.fantastic===true}, architectural=${requestedRegisters.architectural===true}.`;
 const providerPolicy=intent?.validation||{};
 const response=await fetchImpl("https://api.openai.com/v1/chat/completions",{
  method:"POST",
  headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},
  body:JSON.stringify({
   model:"gpt-4o-mini",
   messages:[
    {role:"system",content:[
     "Analyse uniquement les pixels de la photographie brute. N'infère jamais un élément invisible.",
     "Évalue d'abord si l'image raconte réellement le sujet demandé et non si elle contient littéralement une séance de soin.",
     "dramaticMomentPresent=true seulement si l'image capture un instant décisif avec un avant/après implicite. transformationReadable=true seulement si une évolution de tension, d'espace, de posture, de lumière ou de relation se lit visuellement.",
     "cinematicPosterRead=true seulement si l'image ressemble à un photogramme/affiche de film premium avec hiérarchie, lumière directionnelle, profondeur et atmosphère ; une photo de cabinet ou de banque d'images générique vaut false.",
     "threePlaneDepth=true seulement si premier plan, plan principal et arrière-plan sont réellement distincts. genericSpaRisk et literalTreatmentSceneRisk sont compris entre 0 et 1.",
     "observedRegisters contient uniquement les registres réellement visibles. architectureObserved et fantasticObserved ne doivent pas être déduits de la demande.",
     "brandSafeZoneAvailable=true seulement s'il existe une zone calme exploitable pour le futur lock-up sans recouvrir visage, mains, produit ou moment dramatique.",
     "productFidelity=true uniquement si le produit attendu est visiblement fidèle aux références ou si aucune fidélité produit n'est requise.",
     "Distingue le nombre de représentations du nombre d'identités. Si le praticien n'est pas clairement masculin, réponds female ou indeterminate, jamais par supposition.",
     "Retourne les zones sous forme de top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right. Tout texte, logo, URL, pictogramme parasite ou appareil inventé va dans parasites. paletteDrift est entre 0 (noir/or) et 1 (forte dérive)."
    ].join(" ")},
    {role:"user",content:[
     {type:"text",text:`${target}\nContraintes SceneIntent : ${JSON.stringify(providerPolicy)}.\nPrestation : ${contract.name}. Action métier historique (à contrôler uniquement si le mode l'exige) : ${contract.requiredAction}. Signes reconnaissables : ${contract.recognition}. Étapes composites attendues : ${contract.requiredCompositeStages.join(" → ")||"aucune"}. Matériel interdit : ${contract.forbiddenEquipment}; ${contract.forbiddenAccessories}. Analyse ce qui est réellement visible.`},
     {type:"image_url",image_url:{url:dataUrl,detail:"high"}},
    ]}
   ],
   response_format:{type:"json_schema",json_schema:ANALYSIS_SCHEMA},
  })
 });
 if(!response.ok)throw new Error(`Analyse V4 refusée (${response.status}) : ${(await response.text()).slice(0,240)}`);
 const data=await response.json();const content=data.choices?.[0]?.message?.content;if(!content)throw new Error("Analyse V4 vide.");
 try{return JSON.parse(content);}catch(error){throw new Error("Analyse V4 non JSON.");}
}
module.exports={ANALYSIS_SCHEMA,analyzeImageWithOpenAI};
