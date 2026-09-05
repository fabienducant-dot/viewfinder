"use strict";

const crypto=require("crypto");
const {normalizePlatform}=require("./v3-layout-engine");

const VERSION="4.4.0-scene-intent";
const BODYWORK_RE=/massage|drainage|réflexologie/i;
const PRODUCT_NAMES=new Set(["Luminothérapie PSIO®","Biorésonance quantique"]);
const COMPOSITE_NAMES=new Set(["Offre Gold","Offre Sylver"]);

function normalized(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function includesAny(value,terms){const hay=normalized(value);return terms.some(term=>hay.includes(normalized(term)));}
function clean(value){return String(value||"").replace(/\s+/g," ").trim();}
function withoutExact(value,exact){let text=clean(value),needle=clean(exact);if(!needle)return text;while(text.includes(needle))text=text.replace(needle,"le sujet demandé");return clean(text);}
function narrativeSafe(value,fallback,exact){const text=withoutExact(value,exact);return /geste métier|l’action centrale|l'action centrale|praticien|table de massage|dans la prestation|identifier la prestation|geste et le matériel|représenter précisément/i.test(text)?fallback:text||fallback;}

function resolveRegisters(subjectBrief={}){
 const selected=Array.isArray(subjectBrief.selectedRegisters)?subjectBrief.selectedRegisters:[];
 const raw=[...selected,subjectBrief.exactUserRequest||""].join(" ");
 return Object.freeze({cinematic:includesAny(raw,["cinématographie","cinematographie","cinématique","cinematic"]),fantastic:includesAny(raw,["fantastique","fantasy"]),architectural:includesAny(raw,["architecture","architectural","architecturale"])});
}

function explicitDemonstrationRequested(subjectBrief={}){
 const raw=clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||"");
 return /\b(montrer|montre|voir|visualiser|illustrer|filmer|photographier)\b[\s\S]{0,48}\b(séance|geste|technique|pression|étirement|mouvement|massage|réflexologie|appareil|dispositif|lunettes|futon|table)\b/i.test(raw)
  ||/\b(séance|geste|technique|massage en cours|réflexologie en cours|pression manuelle|étirement assisté|mouvement de massage)\b/i.test(raw);
}

function resolveVisualMode(contract,platform,subjectBrief={}){
 const p=normalizePlatform(platform);
 if(p==="Google Business")return "local_credibility";
 if(COMPOSITE_NAMES.has(contract.name))return "composite_fidelity";
 if(PRODUCT_NAMES.has(contract.name))return "product_fidelity";
 if(explicitDemonstrationRequested(subjectBrief))return "demonstration";
 return "narrative_consequence";
}

function transformationFrom(subjectBrief={},mode="narrative_consequence",contract={}){
 const exact=clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||""),focus=clean(subjectBrief.requestedFocus||"");
 if(mode==="narrative_consequence"){
  const dorsal=includesAny(exact,["dos","dorsal","dorsales","blocage","lourdeur","cervical","nuque","tension"]);
  const mental=includesAny(exact,["mental","stress","charge mentale","souffler","lâcher prise","lacher prise","saturation","angoisse"]);
  const fatigue=includesAny(exact,["fatigue","épuisement","epuisement","énergie","energie","vitalité","vitalite"]);
  let before=["Un état initial de contrainte, densité, saturation ou fermeture doit être perceptible par la posture, les volumes, les matières, la lumière ou l’espace",focus?`le focus visuel reste ${focus}`:""].filter(Boolean).join(" ; ")+".";
  let fallbackMoment="L’instant précis où la contrainte commence à perdre son emprise et où l’espace autour du sujet change.";
  let fallbackAfter="Une évolution crédible vers davantage d’espace, d’amplitude ou d’apaisement, sans promesse médicale.";
  if(dorsal){before="Le poids se lit dans une posture comprimée ou retenue : axe du dos sous tension, épaules et volumes environnants semblent peser sur le sujet, sans anatomie médicale.";fallbackMoment="Saisir l’instant exact où la rigidité de la posture et de l’architecture commence à céder autour de l’axe du dos : changement local de lumière, de respiration spatiale et d’équilibre, sans rayon magique ni illustration anatomique.";fallbackAfter="La verticalité et l’espace gagnent progressivement en amplitude ; le décor s’ouvre et la lumière accompagne un allègement perceptible, sans promesse médicale.";}
  else if(mental){before="La surcharge se lit par une composition dense, un espace fermé ou une posture contenue, comme si l’environnement comprimait le sujet.";fallbackMoment="Saisir l’instant où une respiration apparaît dans la composition : le cadre cesse de se refermer, la profondeur reprend et le sujet n’est plus visuellement enfermé.";fallbackAfter="L’image gagne en silence, en espace négatif et en profondeur ; la sensation dominante devient la respiration plutôt que la saturation.";}
  else if(fatigue){before="La fatigue se traduit par une présence ralentie, une lumière retenue et un environnement dense, sans codes médicaux.";fallbackMoment="Saisir l’instant où la lumière et la posture reprennent de la présence, comme un retour progressif de disponibilité plutôt qu’un effet surnaturel.";fallbackAfter="La scène devient plus ouverte, plus lisible et plus vivante, sans promesse de résultat physiologique.";}
  return Object.freeze({before,moment:narrativeSafe(subjectBrief.dramaticMoment,fallbackMoment,exact),after:narrativeSafe(subjectBrief.transformationPromise,fallbackAfter,exact)});
 }
 const rawBefore=subjectBrief.physicalOrEmotionalManifestation||subjectBrief.subjectVisualDirective||contract.recognition||"une situation crédible et immédiatement lisible",rawMoment=subjectBrief.dramaticMoment||"Un instant décisif et crédible où le sens de la scène devient évident.",rawAfter=subjectBrief.transformationPromise||"Une expérience visuellement cohérente, sans promesse médicale.";
 return Object.freeze({before:withoutExact(rawBefore,exact),moment:withoutExact(rawMoment,exact),after:withoutExact(rawAfter,exact)});
}

function peoplePolicyFor(contract,mode,subjectBrief={}){
 if(subjectBrief.forbidsPeople===true)return "Aucune personne dans la scène.";
 if(contract.generic){
  if(subjectBrief.humanNarrativeNeeded===true)return "Une personne anonyme entièrement vêtue peut être présente uniquement si le mini-sujet l’exige clairement ; aucun geste métier ni intervention professionnelle n’est inventé.";
  return "Aucune personne ni intervention professionnelle sauf demande explicite du mini-sujet.";
 }
 if(contract.name==="Massage Enfant")return mode==="narrative_consequence"?"Un enfant entièrement vêtu et son parent peuvent incarner une situation quotidienne digne et rassurante. Aucun soin, aucun déshabillage, aucun contact corporel n’est montré.":"Enfant entièrement vêtu, parent clairement visible, contexte professionnel de bien-être explicite et geste uniquement à travers les vêtements.";
 if(mode==="narrative_consequence"){
  if(contract.name==="Massage Femme enceinte")return "Une femme enceinte adulte, entièrement vêtue, peut être montrée dans une posture naturelle de transition. Aucun praticien ni geste de soin n’est nécessaire.";
  return "Une personne adulte anonyme, entièrement vêtue, peut incarner la transformation. Aucun praticien, aucun geste de soin, aucun déshabillage et aucun contact corporel ne sont nécessaires.";
 }
 if(mode==="product_fidelity"){
  if(contract.name==="Luminothérapie PSIO®")return "Une personne adulte entièrement vêtue porte les lunettes PSiO® officielles dans une posture confortable et neutre. Le produit reste le seul équipement spécifique visible.";
  return "Un adulte entièrement vêtu et, seulement si utile à la compréhension, un praticien en tenue professionnelle sobre. Aucun contexte médical inventé.";
 }
 if(mode==="composite_fidelity"){
  const identities=Number(contract.uniqueIdentityCount||2),practitioner=contract.practitionerIdentity||"le même praticien masculin adulte";
  return `Exactement ${identities} identités uniques : le même bénéficiaire et ${practitioner}. Tenues professionnelles ou sobres, continuité d’identité stricte entre les étapes, aucune troisième personne.`;
 }
 if(mode==="local_credibility")return BODYWORK_RE.test(contract.type)?"Scène locale crédible de bien-être : adultes entièrement vêtus, posture neutre, contexte professionnel. Un praticien peut être présent mais aucun déshabillage ni mise en scène intime.":"Personnes uniquement si elles rendent la prestation immédiatement crédible, avec tenue sobre et contexte professionnel non médical.";
 return "Adultes entièrement vêtus, contexte professionnel explicite, postures neutres et dignes.";
}

function environmentFor({subjectBrief,artDirection,registers,platform}){
 const authority=subjectBrief.spatialAuthority?.description||subjectBrief.explicitSceneRequest?.description||null,exact=clean(subjectBrief.exactUserRequest||""),art=artDirection?.artistic||{};
 if(authority){
  const safe=withoutExact(authority,exact),fallback=withoutExact(art.architectureDescription||art.locationFamily||"",exact);
  return `Le décor décrit dans DEMANDE EXACTE gouverne la scène. ${safe&&safe!=="le sujet demandé"?safe:fallback&&fallback!=="le sujet demandé"?fallback:"Respecter strictement ses éléments spatiaux, son ouverture et sa profondeur."}`;
 }
 if(normalizePlatform(platform)==="Google Business")return "Lieu crédible, simple et premium, immédiatement lisible, sans effet spectaculaire qui ferait croire à un faux cabinet.";
 const pieces=[];
 if(registers.architectural){const architecture=clean(art.architectureDescription||art.locationFamily||"architecture noire et or crédible, avec profondeur réelle et ouverture spatiale");pieces.push(`Architecture : ${architecture}.`);}
 if(registers.fantastic)pieces.push("Fantastique adulte et crédible : l’étrangeté vient de l’échelle, de la profondeur, de la brume, du paysage et de la lumière, jamais d’un effet magique gratuit ou d’un symbole occulte.");
 if(!pieces.length)pieces.push("Environnement SDZ réel ou métaphorique, noir profond et matières sombres détaillées, jamais cabine de spa générique.");
 return pieces.join(" ");
}

function platformPolicyFor(platform){
 const p=normalizePlatform(platform);
 if(p==="Google Business")return Object.freeze({platform:p,brandingZone:"aucun texte intégré dans l’image brute",fantasyStrength:"reduced",composition:"simple, rassurante, sujet immédiatement lisible"});
 if(p==="Story")return Object.freeze({platform:p,brandingZone:"réserver dans les 28 % inférieurs une bande de marque sombre, continue, texturée mais peu contrastée, surtout au centre ; aucun visage, main, produit, horizon, ouverture lumineuse, triangle, diagonale forte, reflet or intense ou élément narratif essentiel dans cette bande",fantasyStrength:"full_if_selected",composition:"verticale 9:16, TROIS PLANS LISIBLES, scène dominante"});
 if(p==="Instagram Portrait"||p==="Instagram Square")return Object.freeze({platform:p,brandingZone:"réserver dans le tiers inférieur une zone sombre, continue et peu contrastée pour le lock-up ; aucune ouverture lumineuse, géométrie forte ou reflet or intense derrière la marque",fantasyStrength:"full_if_selected",composition:"impact immédiat en miniature, sujet décentré et profondeur lisible"});
 if(p==="Facebook")return Object.freeze({platform:p,brandingZone:"zone éditoriale calme distincte du sujet",fantasyStrength:"full_if_selected",composition:"lecture sociale claire, profondeur et respiration"});
 if(p==="Blog"||p==="Bannière")return Object.freeze({platform:p,brandingZone:"zone de respiration latérale ou supérieure selon le format",fantasyStrength:"full_if_selected",composition:"composition horizontale éditoriale, sujet sur un tiers"});
 return Object.freeze({platform:p,brandingZone:"zone sûre calme",fantasyStrength:"full_if_selected",composition:"composition éditoriale premium"});
}

function productDirective(contract,mode){
 if(mode==="product_fidelity"&&contract.name==="Luminothérapie PSIO®")return "FIDÉLITÉ PRODUIT — Reproduire uniquement les lunettes PSiO® officielles à partir des références fournies : forme, proportions, couleurs et détails doivent rester fidèles. Ne rien inventer.";
 if(mode==="product_fidelity"&&contract.name==="Biorésonance quantique")return "PREUVE RÉELLE — Ne montrer qu’un dispositif réellement fourni en référence. Aucun scanner, écran médical ou machine fictive.";
 if(mode==="composite_fidelity")return `CONTINUITÉ DE L’OFFRE — Mise en scène contractuelle : ${contract.requiredAction}. Étapes obligatoires : ${contract.requiredCompositeStages.join(" → ")}. Les étapes appartiennent au même monde visuel, dans un ordre spatial ou temporel lisible, avec les mêmes identités.`;
 if(mode==="demonstration")return `PREUVE MÉTIER — La demande exige explicitement la technique : montrer uniquement le geste distinctif suivant : ${contract.requiredAction}. Tenue : ${contract.outfit}. Position : ${contract.position}. Matériel autorisé : ${contract.allowedEquipment}. Aucun accessoire interdit ou geste générique.`;
 return "";
}

function buildProviderPrompt({contract,subjectBrief,platform,mode,registers,transformation,peoplePolicy,environment,platformPolicy}){
 const exact=clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||""),product=productDirective(contract,mode),registerLine=[registers.cinematic&&"cinématographie",registers.fantastic&&"fantastique crédible",registers.architectural&&"architecture"].filter(Boolean).join(", ")||"socle cinématographique SDZ",narrativeRole=mode==="narrative_consequence"?"La prestation est la cause invisible de la transformation : ne pas illustrer une séance. Montrer la conséquence émotionnelle et corporelle non médicale, dans un moment décisif.":mode==="local_credibility"?"La lisibilité et la crédibilité locale priment sur le spectaculaire.":"La prestation ou le produit peut être visible uniquement parce que ce mode exige une preuve réelle.";
 const lines=["SCÈNE / INTENTION",`Demande exacte : ${exact}`,narrativeRole,`État initial : ${transformation.before}`,`Moment dramatique : ${transformation.moment}`,`Évolution visible : ${transformation.after}`,"","ENVIRONNEMENT COMPOSÉ — DÉCOR / PROFONDEUR",environment,`Composition : ${platformPolicy.composition}.`,"Construire un premier plan sombre, un plan principal narratif et un arrière-plan profond ou une ouverture. Les détails essentiels restent lisibles. Le regard doit sentir un avant et un après hors champ. Le premier plan ne doit jamais envahir ni découper la zone de marque réservée.","","SUJET HUMAIN / SÉCURITÉ",peoplePolicy,product,"","DIRECTION PHOTOGRAPHIQUE SDZ",`Registres actifs : ${registerLine}.`,registers.cinematic||normalizePlatform(platform)!=="Google Business"?"Photographie éditoriale de luxe, photoréaliste, cadrage de film, lumière directionnelle plausible, matière de l’air et profondeur réelle.":"Photographie éditoriale premium, photoréaliste et claire.","Noir profond dominant mais détaillé ; lumière neutre sculptée ; or métallique noble, satiné et localisé. Jamais beige, marron, bois clair, spa générique, Canva, 3D ou illustration.",registers.fantastic?"Le fantastique doit sembler physiquement possible dans un long-métrage prestigieux ; pas de portail automatique, pas de cercle ésotérique, pas d’œil, pas de signes zodiacaux, pas de géométrie occulte, pas d’occultisme ou rituel.":"Aucun effet fantastique ajouté s’il n’est pas demandé.",`Branding futur : ${platformPolicy.brandingZone}. Cette zone reste intégrée au décor, jamais un aplat noir publicitaire. Elle doit être visuellement stable : pas de découpe architecturale brillante, pas de triangle lumineux, pas de diagonale à fort contraste, pas de flare doré ni de détail narratif derrière le futur logo et sa signature.`,"","SORTIE BRUTE","Générer uniquement la photographie. Aucun texte, aucune lettre, aucun logo, aucun zèbre, aucun médaillon, aucun pictogramme, aucune URL, aucun hashtag."].filter(line=>line!==undefined&&line!==null&&line!=="");
 return lines.join("\n");
}

function buildSceneIntent({contract,subjectBrief,artDirection,platform}){
 const mode=resolveVisualMode(contract,platform,subjectBrief),registers=resolveRegisters(subjectBrief),transformation=transformationFrom(subjectBrief,mode,contract),peoplePolicy=peoplePolicyFor(contract,mode,subjectBrief),environment=environmentFor({subjectBrief,artDirection,registers,platform}),platformPolicy=platformPolicyFor(platform),providerPrompt=buildProviderPrompt({contract,subjectBrief,platform,mode,registers,transformation,peoplePolicy,environment,platformPolicy}),serviceRole=mode==="narrative_consequence"?"invisible_cause":mode==="local_credibility"?"credible_context":"visible_proof";
 const validation=Object.freeze({requireDramaticMoment:mode==="narrative_consequence",requireTransformation:mode==="narrative_consequence",requireCinematicPoster:normalizePlatform(platform)!=="Google Business",requireThreePlanes:normalizePlatform(platform)!=="Google Business",requireArchitecture:registers.architectural&&normalizePlatform(platform)!=="Google Business",requireFantastic:registers.fantastic&&normalizePlatform(platform)!=="Google Business",rejectGenericSpa:normalizePlatform(platform)!=="Google Business",requireProductFidelity:mode==="product_fidelity"||mode==="composite_fidelity",requireServiceGesture:mode==="demonstration"});
 const intent={version:VERSION,mode,serviceRole,service:contract.name,platform:normalizePlatform(platform),exactUserRequest:clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme),registers,transformation,peoplePolicy,environment,platformPolicy,providerPrompt,validation},intentId=crypto.createHash("sha256").update(JSON.stringify(intent)).digest("hex");return Object.freeze({...intent,intentId});
}

function auditSceneIntent(intent){
 const prompt=clean(intent?.providerPrompt||""),errors=[];
 if(!intent?.exactUserRequest||!prompt.includes(intent.exactUserRequest))errors.push("demande_exacte_absente");
 if(intent?.exactUserRequest&&prompt.split(intent.exactUserRequest).length-1!==1)errors.push("demande_exacte_dupliquee");
 if(intent?.validation?.requireDramaticMoment&&!/Moment dramatique/i.test(prompt))errors.push("moment_dramatique_absent");
 if(intent?.validation?.requireArchitecture&&!/Architecture/i.test(prompt))errors.push("registre_architecture_perdu");
 if(intent?.validation?.requireFantastic&&!/fantastique/i.test(prompt))errors.push("registre_fantastique_perdu");
 const literalAuditPrompt=prompt.replace(/aucun geste métier/gi,"");
 if(intent?.mode==="narrative_consequence"&&/geste précis sur la zone|praticien et bénéficiaire tous deux visibles|séance de massage|table de massage|L’action centrale reste|geste métier/i.test(literalAuditPrompt))errors.push("retour_illustration_litterale");
 if(prompt.length>4800)errors.push("prompt_trop_long");
 if(!/Aucun texte, aucune lettre, aucun logo/i.test(prompt))errors.push("interdit_branding_absent");
 return Object.freeze({ok:errors.length===0,errors,promptLength:prompt.length});
}

module.exports={VERSION,resolveRegisters,explicitDemonstrationRequested,resolveVisualMode,transformationFrom,peoplePolicyFor,environmentFor,buildSceneIntent,auditSceneIntent,platformPolicyFor};