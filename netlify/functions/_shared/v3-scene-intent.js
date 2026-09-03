"use strict";

const crypto=require("crypto");
const {normalizePlatform}=require("./v3-layout-engine");

const VERSION="4.0.0-scene-intent";
const BODYWORK_RE=/massage|drainage|réflexologie/i;
const PRODUCT_NAMES=new Set(["Luminothérapie PSIO®","Biorésonance quantique"]);
const COMPOSITE_NAMES=new Set(["Offre Gold","Offre Sylver"]);

function normalized(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function includesAny(value,terms){const hay=normalized(value);return terms.some(term=>hay.includes(normalized(term)));}
function clean(value){return String(value||"").replace(/\s+/g," ").trim();}

function resolveRegisters(subjectBrief={}){
  const selected=Array.isArray(subjectBrief.selectedRegisters)?subjectBrief.selectedRegisters:[];
  const raw=[...selected,subjectBrief.exactUserRequest||""].join(" ");
  return Object.freeze({
    cinematic:includesAny(raw,["cinématographie","cinematographie","cinématique","cinematic"]),
    fantastic:includesAny(raw,["fantastique","fantasy"]),
    architectural:includesAny(raw,["architecture","architectural","architecturale"]),
  });
}

function explicitDemonstrationRequested(subjectBrief={}){
  const raw=clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||"");
  return /\b(montrer|séance|geste|technique|pression|étirement|mouvement|massage en cours|réflexologie|pieds|visage|lunettes|appareil|dispositif|futon|table de massage)\b/i.test(raw);
}

function resolveVisualMode(contract,platform,subjectBrief={}){
  const normalizedPlatform=normalizePlatform(platform);
  if(normalizedPlatform==="Google Business")return "local_credibility";
  if(COMPOSITE_NAMES.has(contract.name))return "composite_fidelity";
  if(PRODUCT_NAMES.has(contract.name))return "product_fidelity";
  if(explicitDemonstrationRequested(subjectBrief))return "demonstration";
  return "narrative_consequence";
}

function transformationFrom(subjectBrief={}){
  const core=clean(subjectBrief.coreTheme||subjectBrief.exactUserRequest||"un état de tension intérieure");
  const before=clean(subjectBrief.physicalOrEmotionalManifestation||subjectBrief.subjectVisualDirective||core);
  const moment=clean(subjectBrief.dramaticMoment||`L’instant précis où « ${core} » commence à perdre son emprise et où l’espace autour du sujet change.`);
  const after=clean(subjectBrief.transformationPromise||`Une évolution crédible vers davantage d’espace, d’amplitude ou d’apaisement, sans promesse médicale.`);
  return Object.freeze({before,moment,after});
}

function peoplePolicyFor(contract,mode,subjectBrief={}){
  if(subjectBrief.forbidsPeople===true)return "Aucune personne dans la scène.";
  if(contract.name==="Massage Enfant")return mode==="narrative_consequence"
    ?"Un enfant entièrement vêtu et son parent sont visibles dans une situation quotidienne digne et rassurante. Aucun soin, aucun déshabillage, aucun contact corporel n’est montré."
    :"Enfant entièrement vêtu, parent clairement visible, contexte professionnel de bien-être explicite et geste uniquement à travers les vêtements.";
  if(mode==="narrative_consequence"){
    if(contract.name==="Massage Femme enceinte")return "Une femme enceinte adulte, entièrement vêtue, est montrée dans une posture naturelle de transition. Aucun praticien ni geste de soin n’est nécessaire.";
    return "Une personne adulte anonyme, entièrement vêtue, peut incarner la transformation. Aucun praticien, aucun geste de soin, aucun déshabillage et aucun contact corporel ne sont nécessaires.";
  }
  if(mode==="product_fidelity"){
    if(contract.name==="Luminothérapie PSIO®")return "Une personne adulte entièrement vêtue porte les lunettes PSiO® officielles dans une posture confortable et neutre. Le produit reste le seul équipement spécifique visible.";
    return "Un adulte entièrement vêtu et, seulement si utile à la compréhension, un praticien en tenue professionnelle sobre. Aucun contexte médical inventé.";
  }
  if(mode==="composite_fidelity")return "Deux adultes maximum : le même bénéficiaire et le même praticien masculin adulte lorsqu’il est visible. Tenues professionnelles ou sobres, continuité d’identité stricte entre les étapes.";
  if(mode==="local_credibility"){
    if(BODYWORK_RE.test(contract.type))return "Scène locale crédible de bien-être : adultes entièrement vêtus, posture neutre, contexte professionnel. Un praticien peut être présent mais aucun déshabillage ni mise en scène intime.";
    return "Personnes uniquement si elles rendent la prestation immédiatement crédible, avec tenue sobre et contexte professionnel non médical.";
  }
  return "Adultes entièrement vêtus, contexte professionnel explicite, postures neutres et dignes.";
}

function environmentFor({subjectBrief,artDirection,registers,platform}){
  const authority=subjectBrief.spatialAuthority?.description||subjectBrief.explicitSceneRequest?.description||null;
  if(authority)return `Le décor explicitement demandé gouverne la scène : ${clean(authority)}.`;
  if(normalizePlatform(platform)==="Google Business")return "Lieu crédible, simple et premium, immédiatement lisible, sans effet spectaculaire qui ferait croire à un faux cabinet.";
  const art=artDirection?.artistic||{};
  const pieces=[];
  if(registers.architectural){
    const architecture=clean(art.architectureDescription||art.locationFamily||"architecture noire et or crédible, avec profondeur réelle et ouverture spatiale");
    pieces.push(`Architecture : ${architecture}.`);
  }
  if(registers.fantastic){
    pieces.push("Fantastique adulte et crédible : l’étrangeté vient de l’échelle, de la profondeur, de la brume, du paysage et de la lumière, jamais d’un effet magique gratuit ou d’un symbole occulte.");
  }
  if(!pieces.length)pieces.push("Environnement SDZ réel ou métaphorique, noir profond et matières sombres détaillées, jamais cabine de spa générique.");
  return pieces.join(" ");
}

function platformPolicyFor(platform){
  const p=normalizePlatform(platform);
  if(p==="Google Business")return Object.freeze({platform:p,brandingZone:"aucun texte intégré dans l’image brute",fantasyStrength:"reduced",composition:"simple, rassurante, sujet immédiatement lisible"});
  if(p==="Story")return Object.freeze({platform:p,brandingZone:"réserver une zone calme et texturée dans le quart inférieur, sans visage ni élément narratif essentiel",fantasyStrength:"full_if_selected",composition:"verticale 9:16, profondeur en trois plans, scène dominante"});
  if(p==="Instagram Portrait"||p==="Instagram Square")return Object.freeze({platform:p,brandingZone:"réserver une zone calme dans le tiers inférieur sans sacrifier le sujet",fantasyStrength:"full_if_selected",composition:"impact immédiat en miniature, sujet décentré et profondeur lisible"});
  if(p==="Facebook")return Object.freeze({platform:p,brandingZone:"zone éditoriale calme distincte du sujet",fantasyStrength:"full_if_selected",composition:"lecture sociale claire, profondeur et respiration"});
  if(p==="Blog"||p==="Bannière")return Object.freeze({platform:p,brandingZone:"zone de respiration latérale ou supérieure selon le format",fantasyStrength:"full_if_selected",composition:"composition horizontale éditoriale, sujet sur un tiers"});
  return Object.freeze({platform:p,brandingZone:"zone sûre calme",fantasyStrength:"full_if_selected",composition:"composition éditoriale premium"});
}

function productDirective(contract,mode){
  if(mode==="product_fidelity"&&contract.name==="Luminothérapie PSIO®")return "FIDÉLITÉ PRODUIT — Reproduire uniquement les lunettes PSiO® officielles à partir des références fournies : forme, proportions, couleurs et détails doivent rester fidèles. Ne rien inventer.";
  if(mode==="product_fidelity"&&contract.name==="Biorésonance quantique")return "PREUVE RÉELLE — Ne montrer qu’un dispositif réellement fourni en référence. Aucun scanner, écran médical ou machine fictive.";
  if(mode==="composite_fidelity")return `CONTINUITÉ DE L’OFFRE — ${contract.requiredCompositeStages.join(" → ")}. Les étapes doivent appartenir au même monde visuel et conserver les mêmes identités.`;
  if(mode==="demonstration")return `PREUVE MÉTIER — Si la demande utilisateur exige explicitement la technique, montrer uniquement le geste distinctif suivant : ${contract.requiredAction}. Aucun accessoire interdit ou geste générique.`;
  return "";
}

function buildProviderPrompt({contract,subjectBrief,artDirection,platform,mode,registers,transformation,peoplePolicy,environment,platformPolicy}){
  const exact=clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||"");
  const product=productDirective(contract,mode);
  const registerLine=[registers.cinematic&&"cinématographie",registers.fantastic&&"fantastique crédible",registers.architectural&&"architecture"].filter(Boolean).join(", ")||"socle cinématographique SDZ";
  const narrativeRole=mode==="narrative_consequence"
    ?"La prestation est la cause invisible de la transformation : ne pas illustrer une séance. Montrer la conséquence émotionnelle et corporelle non médicale, dans un moment décisif."
    :mode==="local_credibility"
      ?"La lisibilité et la crédibilité locale priment sur le spectaculaire."
      :"La prestation ou le produit peut être visible uniquement parce que ce mode exige une preuve réelle.";
  const lines=[
    "SCÈNE / INTENTION",
    `Demande exacte : ${exact}`,
    narrativeRole,
    `État initial : ${transformation.before}`,
    `Moment dramatique : ${transformation.moment}`,
    `Évolution visible : ${transformation.after}`,
    "",
    "DÉCOR / PROFONDEUR",
    environment,
    `Composition : ${platformPolicy.composition}.`,
    "Construire un premier plan sombre, un plan principal narratif et un arrière-plan profond ou une ouverture. Le regard doit sentir un avant et un après hors champ.",
    "",
    "SUJET HUMAIN / SÉCURITÉ",
    peoplePolicy,
    product,
    "",
    "DIRECTION PHOTOGRAPHIQUE SDZ",
    `Registres actifs : ${registerLine}.`,
    registers.cinematic||normalizePlatform(platform)!=="Google Business"?"Photographie éditoriale de luxe, photoréaliste, cadrage de film, lumière directionnelle plausible, matière de l’air et profondeur réelle.":"Photographie éditoriale premium, photoréaliste et claire.",
    "Noir profond dominant mais détaillé ; lumière neutre sculptée ; or métallique noble, satiné et localisé. Jamais beige, marron, bois clair, spa générique, Canva, 3D ou illustration.",
    registers.fantastic?"Le fantastique doit sembler physiquement possible dans un long-métrage prestigieux ; pas de portail automatique, pas de cercle ésotérique, pas d’œil, pas de signes zodiacaux, pas de géométrie occulte.":"Aucun effet fantastique ajouté s’il n’est pas demandé.",
    `Branding futur : ${platformPolicy.brandingZone}. Cette zone reste intégrée au décor, jamais un aplat noir publicitaire.`,
    "",
    "SORTIE BRUTE",
    "Générer uniquement la photographie. Aucun texte, aucune lettre, aucun logo, aucun zèbre, aucun médaillon, aucun pictogramme, aucune URL, aucun hashtag."
  ].filter(line=>line!==undefined&&line!==null&&line!=="");
  return lines.join("\n");
}

function buildSceneIntent({contract,subjectBrief,artDirection,platform}){
  const mode=resolveVisualMode(contract,platform,subjectBrief);
  const registers=resolveRegisters(subjectBrief);
  const transformation=transformationFrom(subjectBrief);
  const peoplePolicy=peoplePolicyFor(contract,mode,subjectBrief);
  const environment=environmentFor({subjectBrief,artDirection,registers,platform});
  const platformPolicy=platformPolicyFor(platform);
  const providerPrompt=buildProviderPrompt({contract,subjectBrief,artDirection,platform,mode,registers,transformation,peoplePolicy,environment,platformPolicy});
  const serviceRole=mode==="narrative_consequence"?"invisible_cause":mode==="local_credibility"?"credible_context":"visible_proof";
  const validation=Object.freeze({
    requireDramaticMoment:mode==="narrative_consequence",
    requireTransformation:mode==="narrative_consequence",
    requireCinematicPoster:normalizePlatform(platform)!=="Google Business",
    requireThreePlanes:normalizePlatform(platform)!=="Google Business",
    requireArchitecture:registers.architectural&&normalizePlatform(platform)!=="Google Business",
    requireFantastic:registers.fantastic&&normalizePlatform(platform)!=="Google Business",
    rejectGenericSpa:normalizePlatform(platform)!=="Google Business",
    requireProductFidelity:mode==="product_fidelity"||mode==="composite_fidelity",
    requireServiceGesture:mode==="demonstration",
  });
  const intent={version:VERSION,mode,serviceRole,service:contract.name,platform:normalizePlatform(platform),exactUserRequest:clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme),registers,transformation,peoplePolicy,environment,platformPolicy,providerPrompt,validation};
  const intentId=crypto.createHash("sha256").update(JSON.stringify(intent)).digest("hex");
  return Object.freeze({...intent,intentId});
}

function auditSceneIntent(intent){
  const prompt=clean(intent?.providerPrompt||"");
  const errors=[];
  if(!intent?.exactUserRequest||!prompt.includes(intent.exactUserRequest))errors.push("demande_exacte_absente");
  if(intent?.validation?.requireDramaticMoment&&!/Moment dramatique/i.test(prompt))errors.push("moment_dramatique_absent");
  if(intent?.validation?.requireArchitecture&&!/Architecture/i.test(prompt))errors.push("registre_architecture_perdu");
  if(intent?.validation?.requireFantastic&&!/fantastique/i.test(prompt))errors.push("registre_fantastique_perdu");
  if(intent?.mode==="narrative_consequence"&&/geste précis sur la zone|praticien et bénéficiaire tous deux visibles|séance de massage|table de massage/i.test(prompt))errors.push("retour_illustration_litterale");
  if(prompt.length>4800)errors.push("prompt_trop_long");
  if(!/Aucun texte, aucune lettre, aucun logo/i.test(prompt))errors.push("interdit_branding_absent");
  return Object.freeze({ok:errors.length===0,errors,promptLength:prompt.length});
}

module.exports={VERSION,resolveRegisters,resolveVisualMode,buildSceneIntent,auditSceneIntent,platformPolicyFor};
