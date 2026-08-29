"use strict";

const TEXT_MODES=Object.freeze({automatic:"TEXT_MODE_EDITORIAL",title:"TEXT_MODE_MINIMAL",editorial:"TEXT_MODE_EDITORIAL",complete:"TEXT_MODE_OFFER",none:"TEXT_MODE_NONE"});
const GOLDEN_TARGET=Object.freeze({name:"Story SDZ — narration immédiatement lisible",principles:["sujet compréhensible sans texte","émotion visible","architecture narrative","fantastique lié au thème","trois plans utiles","lumière liée à la transformation","noirs détaillés","logo proéminent","aucun spa générique","aucune apparence Canva"]});
const WEAK_WORDS=new Set(["DE","DU","DES","LE","LA","LES","UN","UNE","À","AU","AUX","ET","OU","POUR","DANS"]);
const TRANSFORMATION_CATEGORIES=Object.freeze([
  {pattern:/lourd|bloc|tension|pression|raide/i,initial:"poids et tension visibles",change:"les masses s’allègent et l’espace s’ouvre"},
  {pattern:/agit|stress|dispers|débord/i,initial:"agitation et dispersion visibles",change:"le rythme ralentit et la composition se recentre"},
  {pattern:/fatigu|épuis|manque d'énergie|élan/i,initial:"fatigue et verticalité retenue",change:"la présence et la lumière progressent"},
  {pattern:/ferm|repli|isol/i,initial:"fermeture corporelle et spatiale",change:"la posture et la perspective s’ouvrent"},
]);
const CLAIM_RULES=Object.freeze([
  {pattern:/\b(guéri(?:son|r)?|diagnosti(?:c|quer)|thérapeutique|médical(?:e)?)\b/gi,replacement:"expérience de bien-être"},
  {pattern:/\b(soulagement|résultat|effet)\s+(absolu|total|garanti|certain)\b/gi,replacement:"sensation d’apaisement suggérée"},
  {pattern:/\b(disparition|élimination)\s+(totale|définitive|garantie)\b/gi,replacement:"évolution ressentie"},
  {pattern:/\b(garanti(?:e|s)?|certain(?:e|s)?)\b/gi,replacement:"suggérée"},
  {pattern:/\bsouffr(?:e|ent)\s+de\s+douleurs?\s+localisées?\b/gi,replacement:"évoquent des tensions localisées"},
]);

function clean(value){return String(value||"").trim().replace(/\s+/g," ");}
function normalize(value){return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function semanticTokens(value){return new Set(normalize(value).split(/[^a-z0-9®]+/).filter(x=>x.length>2));}
function sanitizeClaims(value){let output=clean(value),violations=[];for(const rule of CLAIM_RULES){rule.pattern.lastIndex=0;if(rule.pattern.test(output)){violations.push(rule.pattern.source);rule.pattern.lastIndex=0;output=output.replace(rule.pattern,rule.replacement);}}return {text:output,violations,ok:violations.length===0};}
function sentenceCase(value){const text=clean(value).replace(/\s+([,.;:!?])/g,"$1");return text?text[0].toUpperCase()+text.slice(1):"";}
function extractFacts(raw){
 const text=clean(raw),facts=[];
 const postal=text.match(/\b(\d{5})\s+(?:à\s+)?([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40}?)(?=[,.!?]|$)/i);
 const street=text.match(/\b(\d{1,4})\s+(cour|cours|rue|avenue|av\.?|boulevard|bd\.?|place|chemin|route|impasse)\s+([^,.!?]{2,55})/i);
 const year=text.match(/\bdepuis\s+(19\d{2}|20\d{2})\b/i);
 const location=postal?{postalCode:postal[1],city:sentenceCase(postal[2].replace(/^à\s+/i,""))}:null;
 const address=street?sentenceCase(`${street[1]} ${street[2]} ${street[3]}`.replace(/\s+$/,"")):null;
 if(address)facts.push(address);if(location)facts.push(`${location.postalCode} ${location.city}`);if(year)facts.push(`depuis ${year[1]}`);
 return {location,address,year:year?.[1]||null,facts};
}
function classifySubject(raw,contract){
 const value=normalize(raw);
 if(contract.generic&&(/\b(porte ouverte|evenement|atelier|salon|journee|date|rendez-vous)\b/.test(value)))return "event";
 if(/\b(offre|promotion|promo|cadeau|bon cadeau|nouveaute|lancement)\b/.test(value))return "offer";
 if(contract.generic&&(/\b(decouvr|univers|cabinet|adresse|raisimes|raismes|havre|lieu|expertise|savoir-faire|depuis)\b/.test(value)))return "institutional";
 if(/\b(?:lourd|bloqu|tension|stress|agit|fatigu|epuis|elan|ferme|repli|douleur)/.test(value))return "transformation";
 return contract.generic?"editorial":"service";
}
function conciseTheme(raw,contract,kind,facts){
 const value=sanitizeClaims(raw).text;
 if(kind==="institutional")return facts.location?.city?`un havre de paix à ${facts.location.city}`:"découvrir l’univers de La Santé des Zèbres";
 if(kind==="event")return "un rendez-vous à découvrir";
 if(kind==="offer")return /cadeau/i.test(value)?"une attention à offrir":"une offre à découvrir";
 // La demande utilisateur est le sujet de la photographie. Elle ne doit pas
 // être réduite à 8 ou 9 mots avant d'atteindre le modèle image.
 if(kind==="transformation"||kind==="service"||kind==="editorial")return value.length>320?`${value.slice(0,317).trim()}…`:value||contract.name||"l’univers SDZ";
 return value||"l’univers SDZ";
}
function editorialInterpretation(raw,contract){
 const facts=extractFacts(raw),kind=classifySubject(raw,contract),theme=conciseTheme(raw,contract,kind,facts);
 let title,subtitle,visualSubject,audienceIntent,initialState,desiredShift;
 if(kind==="institutional"){
   title=facts.location?.city?`UN HAVRE DE PAIX À ${facts.location.city.toUpperCase()}`:"DÉCOUVRIR L’UNIVERS SDZ";
   subtitle=facts.year?`EXPERTISE ET SAVOIR-FAIRE DEPUIS ${facts.year}`:"UNE ATMOSPHÈRE SINGULIÈRE";
   visualSubject="manifestation visible : le cabinet et son atmosphère accueillante, montrés comme un lieu réel et crédible";
   audienceIntent="personnes qui souhaitent découvrir le cabinet avant de choisir leur expérience";
   initialState="un lieu encore inconnu, perçu depuis son seuil";desiredShift="une invitation claire à entrer, découvrir et prendre contact";
 }else if(kind==="event"){
   title="UN RENDEZ-VOUS À DÉCOUVRIR";subtitle=facts.location?.city?facts.location.city.toUpperCase():"À LA SANTÉ DES ZÈBRES";
   visualSubject="manifestation visible : le rendez-vous, sa date ou son action principale rendus immédiatement compréhensibles";
   audienceIntent="personnes susceptibles de participer à l’événement";initialState="une information encore abstraite";desiredShift="un rendez-vous concret et facile à rejoindre";
 }else if(kind==="offer"){
   title=/cadeau/i.test(raw)?"OFFRIR UNE EXPÉRIENCE SINGULIÈRE":"UNE OFFRE À DÉCOUVRIR";subtitle="LA SANTÉ DES ZÈBRES — RAISMES";
   visualSubject="manifestation visible : l’objet ou l’avantage explicitement annoncé, sans prix ni prestation inventés";
   audienceIntent="personnes à la recherche d’une attention ou d’une offre clairement expliquée";initialState="une intention à préciser";desiredShift="une proposition concrète et désirable";
 }else if(kind==="transformation"){
   title=/elan|fatigu|epuis/i.test(normalize(raw))?"RETROUVER DE L’ÉLAN":/stress|agit|tension/i.test(normalize(raw))?"RETROUVER UN RYTHME PLUS CALME":"VERS PLUS DE LÉGÈRETÉ";
   subtitle=contract.generic?"":contract.name.toUpperCase();
   visualSubject=`manifestation visible de « ${theme} », exprimée par la posture, le geste et l’espace`;
   audienceIntent=`personnes qui se reconnaissent dans « ${theme} »`;initialState=`la sensation initiale liée à « ${theme} »`;desiredShift="une évolution sensible, crédible et sans promesse médicale";
 }else{
   title=contract.generic?"UNE HISTOIRE À PARTAGER":contract.name.toUpperCase();subtitle=contract.generic?"L’UNIVERS SDZ":sentenceCase(theme).toUpperCase();
   visualSubject=contract.generic?`manifestation visible du sujet « ${theme} », incarné par une scène concrète`:`manifestation visible de « ${theme} » dans la prestation ${contract.name}, rendue reconnaissable par son geste métier`;
   audienceIntent=contract.generic?`personnes concernées par « ${theme} »`:`personnes intéressées par ${contract.name}`;
   initialState=`le point de départ exprimé dans « ${theme} »`;desiredShift=contract.generic?"une compréhension immédiate du message":"une expérience crédible et désirable";
 }
 return {kind,theme,title:sanitizeClaims(title).text,subtitle:sanitizeClaims(subtitle).text,visualSubject,audienceIntent,initialState,desiredShift,...facts};
}
function genericVisualPlan(interpretation){
 const theme=interpretation.theme;
 if(interpretation.kind==="institutional")return {
  recognition:"le cabinet et son atmosphère accueillante sont immédiatement reconnaissables",
  focus:"le seuil, la perspective intérieure et la lumière d’accueil",
  action:"invitation visuelle à franchir le seuil et découvrir le lieu",
  primarySubject:"le cabinet SDZ vu depuis son seuil, avec une perspective intérieure intime et crédible",
  secondarySubject:"matières noires et or, lumière d’accueil et détails réels du lieu",
  peoplePolicy:"aucune personne ni intervention professionnelle sauf demande explicite",
  scenePolicy:"le lieu, son ambiance et sa perspective portent seuls le message",
  protectedAreas:["perspective d’entrée du cabinet","matières noires et or","lumière d’accueil","ouverture architecturale"],
 };
 if(interpretation.kind==="event")return {
  recognition:"l’action principale du rendez-vous est immédiatement identifiable sans texte",
  focus:"l’action principale, ses participants nécessaires et le lieu du rendez-vous",
  action:"accueil ou participation naturellement visible, sans rôle professionnel inventé",
  primarySubject:"scène concrète représentant le rendez-vous et son activité principale, uniquement à partir des éléments du sujet",
  secondarySubject:"lieu, objets et participants explicitement requis par le sujet",
  peoplePolicy:"n’inclure que les personnes nécessaires au rendez-vous décrit ; aucun rôle professionnel inventé",
  scenePolicy:"l’activité réelle du rendez-vous porte le message",
  protectedAreas:["action principale du rendez-vous","participants ou objets demandés","contexte SDZ","ouverture architecturale"],
 };
 if(interpretation.kind==="offer")return {
  recognition:"l’objet ou l’avantage réellement annoncé est immédiatement identifiable sans texte",
  focus:"l’objet ou l’avantage réellement annoncé",
  action:"présentation premium de l’objet ou de l’avantage annoncé, sans prix ni prestation inventés",
  primarySubject:"l’objet ou l’avantage explicitement annoncé dans le sujet, présenté de façon concrète et premium",
  secondarySubject:"contexte SDZ sobre dérivé uniquement du sujet",
  peoplePolicy:"aucune personne sauf nécessité explicite du sujet",
  scenePolicy:"l’objet ou l’avantage annoncé porte seul la promesse visuelle",
  protectedAreas:["objet ou avantage annoncé","preuve visuelle du sujet","contexte SDZ","ouverture architecturale"],
 };
 if(interpretation.kind==="transformation")return {
  recognition:`la sensation « ${theme} » est immédiatement compréhensible par la posture, l’espace et la lumière`,
  focus:`la posture et l’espace qui incarnent « ${theme} »`,
  action:"évolution visible de la posture et de l’espace, sans intervention professionnelle inventée",
  primarySubject:`une scène humaine concrète incarnant « ${theme} » par la posture et l’espace`,
  secondarySubject:"environnement SDZ soutenant l’évolution émotionnelle",
  peoplePolicy:"une personne expressive si nécessaire au sujet ; aucun praticien ni geste métier inventé",
  scenePolicy:"la posture, l’espace et la lumière racontent la transformation",
  protectedAreas:["posture expressive","évolution lumineuse","contexte SDZ","ouverture architecturale"],
 };
 return {
  recognition:`le sujet « ${theme} » est immédiatement compréhensible par la scène seule`,
  focus:`le sujet concret « ${theme} »`,
  action:"mise en scène concrète du sujet, sans intervention professionnelle inventée",
  primarySubject:`une scène concrète centrée sur « ${theme} »`,
  secondarySubject:"contexte SDZ discret dérivé uniquement du sujet",
  peoplePolicy:"aucune personne sauf nécessité explicite du sujet",
  scenePolicy:"le sujet concret porte seul le message visuel",
  protectedAreas:["sujet concret","preuve visuelle du message","contexte SDZ","ouverture architecturale"],
 };
}
const BODY_FOCUS_RULES=Object.freeze([
 {pattern:/\b(dorsal(?:e|es)?|dos)\b/i,focus:"dos / posture"},
 {pattern:/\b(lombaire|lombaires)\b/i,focus:"bas du dos / zone lombaire"},
 {pattern:/\b(cervical|cervicale|cervicales|cervicaux)\b/i,focus:"cou / nuque"},
 {pattern:/\bépaules?\b/i,focus:"épaules"},
 {pattern:/\bjambes?\b/i,focus:"jambes"},
 {pattern:/\bvisage\b/i,focus:"visage"},
 {pattern:/\b(ventre|abdominal|abdominale|abdominaux)\b/i,focus:"abdomen"},
]);
const EXPLICIT_ENVIRONMENT_PATTERN=/\b(architecture|arche|temple|pavillon|terrasse|jardin|galerie|arcade|forêt|montagne|cabinet|extérieur|plage|ville|intérieur|lac|eau|reflet|horizon|paysage|pièce|salle|couloir|fenêtre|ouverture|porte|falaise|rivage|brume|clairière)\b/i;
function findRequestedFocus(rawSubject,contract){if(contract.generic)return BODY_FOCUS_RULES.find(rule=>rule.pattern.test(rawSubject))?.focus||null;const subject=semanticTokens(rawSubject),candidates=clean(contract.bodyZones).split(/,|\bou\b|\bet\b|\//i).map(clean).filter(Boolean);const matches=candidates.filter(candidate=>[...semanticTokens(candidate)].some(token=>[...subject].some(given=>given===token||given.startsWith(token.slice(0,Math.min(token.length,token.length<=4?2:4)))||token.startsWith(given.slice(0,Math.min(given.length,given.length<=4?2:4))))));return matches.length?matches.join(", "):BODY_FOCUS_RULES.find(rule=>rule.pattern.test(rawSubject))?.focus||null;}
function transformationFor(rawSubject,focus,contract,interpretation){const category=TRANSFORMATION_CATEGORIES.find(x=>x.pattern.test(rawSubject));const initial=category?.initial||interpretation?.initialState||`état initial lié à ${contract.name}`;const change=category?.change||interpretation?.desiredShift||"l’attention, la lumière et l’ambiance évoluent avec subtilité";return `${initial}${focus?` autour de ${focus}`:""}, puis ${change}, sans résultat médical ni certitude absolue`;
}
function extractExplicitScene(rawSubject){const raw=clean(rawSubject);if(!raw)return null;const match=EXPLICIT_ENVIRONMENT_PATTERN.exec(raw);if(!match)return null;const sentences=raw.split(/(?<=[.!?])\s+/);const spatialSentences=sentences.filter(part=>EXPLICIT_ENVIRONMENT_PATTERN.test(part)).map(part=>part.replace(/[.!?]+$/,"" ).trim());return Object.freeze({keyword:match[0].toLowerCase(),description:spatialSentences.join(". ")||raw,explicit:true});}
function buildSubjectVisualDirective(rawSubject,contract,requestedFocus){const raw=clean(rawSubject)||"le sujet éditorial sélectionné",value=normalize(raw),action=contract.generic?"":clean(contract.requiredAction),focus=clean(requestedFocus||contract.bodyZones);if(/\b(mental|lacher prise|stress|charge mentale|rumination|apaisement|calme)/.test(value))return `Rendre « ${raw} » immédiatement lisible par un passage visuel d’un premier plan dense ou resserré vers une perspective calme, ample et respirante, sans symbole littéral ni effet magique spectaculaire. ${action?`L’action centrale reste ${action}.`:""}`.trim();if(/\b(douleur|blocage|lourdeur|tension|contrainte|raideur|oppress)/.test(value))return `Rendre « ${raw} » immédiatement lisible : montrer d’abord la contrainte dans la posture, les volumes ou l’espace resserré, puis une ouverture crédible vers davantage d’amplitude, de profondeur et de lumière. ${action?`L’action centrale reste ${action}.`:""}`.trim();if(!contract.generic)return `Représenter précisément « ${raw} » par ${action||"l’action réelle de la prestation"}${focus?`, centrée sur ${focus}`:""}. Le geste et le matériel doivent permettre d’identifier la prestation avant toute lecture de texte.`;return `Mettre en scène « ${raw} » de façon concrète et immédiatement compréhensible ; l’univers SDZ soutient ce sujet sans le remplacer.`;}
function inferSubjectBrief({subject,selectedRegisters=[],service,marketingObjective="Faire réserver",contract}={}){const rawSubject=clean(subject),serviceContract=contract||{name:service,bodyZones:"",recognition:"",requiredAction:""};const interpretation=editorialInterpretation(rawSubject,serviceContract);const genericPlan=serviceContract.generic?genericVisualPlan(interpretation):null;const exactUserRequest=sanitizeClaims(rawSubject||interpretation.theme).text;const explicit=extractExplicitScene(exactUserRequest);const requestedFocus=findRequestedFocus(exactUserRequest,serviceContract);const subjectVisualDirective=buildSubjectVisualDirective(exactUserRequest,serviceContract,requestedFocus);const transformationPromise=transformationFor(exactUserRequest,requestedFocus,serviceContract,interpretation);const manifestation=`${interpretation.visualSubject}${requestedFocus?`, centrée sur ${requestedFocus}`:""}. ${subjectVisualDirective}`;const primary=genericPlan?.primarySubject||`${serviceContract.primarySubject}. Sujet précis à rendre visible : ${exactUserRequest}`;const forbidsPeople=/\b(sans (?:personne|humain|silhouette)|aucune personne)\b/i.test(exactUserRequest);const humanNarrativeNeeded=!forbidsPeople&&serviceContract.generic&&Boolean(requestedFocus||/\b(douleur|blocage|lourdeur|stress|rumination|épuisement|fatigue|libération)\b/i.test(exactUserRequest));const peoplePolicy=forbidsPeople?"aucune personne":humanNarrativeNeeded?"une personne anonyme peut incarner la posture ou l’émotion ; aucun praticien ni intervention professionnelle inventés":genericPlan?.peoplePolicy||"personnes et rôles conformes au contrat métier";return Object.freeze({rawSubject,exactUserRequest,coreTheme:interpretation.theme,audienceProblem:interpretation.audienceIntent,physicalOrEmotionalManifestation:manifestation,subjectVisualDirective,transformationPromise,dramaticMoment:transformationPromise,explicitSceneRequest:explicit,spatialAuthority:explicit,userConstraints:exactUserRequest?[`La scène doit représenter explicitement la demande utilisateur : ${exactUserRequest}`]:[],explicitTextRequest:null,selectedRegisters:[...selectedRegisters],relatedService:serviceContract.name,marketingObjective,requestedFocus,humanNarrativeNeeded,forbidsPeople,officialRecognition:genericPlan?.recognition||serviceContract.recognition,officialAction:genericPlan?.action||serviceContract.requiredAction,visualFocus:requestedFocus||genericPlan?.focus||serviceContract.recognition,visualPrimarySubject:primary,visualSecondarySubject:explicit?.description||genericPlan?.secondarySubject||serviceContract.secondarySubject,peoplePolicy,scenePolicy:genericPlan?.scenePolicy||"la prestation et son geste métier portent le message",visualProtectedAreas:genericPlan?.protectedAreas||[],editorialKind:interpretation.kind,editorialTitle:interpretation.title,editorialSubtitle:interpretation.subtitle,verifiedFacts:interpretation.facts,location:interpretation.location,address:interpretation.address,experienceSince:interpretation.year,noMedicalDiagnosis:true});}
function semanticLines(text,maxLines=4,maxChars=18){const words=clean(text).toUpperCase().split(" ").filter(Boolean);const lines=[];let line="";for(const word of words){const next=line?`${line} ${word}`:word;if(next.length<=maxChars||!line)line=next;else{lines.push(line);line=word;}}if(line)lines.push(line);while(lines.length>maxLines){let smallest=0;for(let i=1;i<lines.length-1;i++)if(lines[i].length<lines[smallest].length)smallest=i;lines[smallest]=`${lines[smallest]} ${lines.splice(smallest+1,1)[0]}`;}for(let i=0;i<lines.length-1;i++){const last=lines[i].split(" ").at(-1);if(WEAK_WORDS.has(last)&&lines[i+1]){lines[i]=lines[i].slice(0,-last.length).trim();lines[i+1]=`${last} ${lines[i+1]}`;}}return lines.filter(Boolean);}
function storyTitleLines(title){const lines=semanticLines(title,4,18);if(lines.length!==1)return lines;const words=clean(title).toUpperCase().split(" ").filter(Boolean);if(words.length<2)return lines;const middle=Math.ceil(words.length/2);return [words.slice(0,middle).join(" "),words.slice(middle).join(" ")].filter(Boolean);}
function titleFor(subjectBrief,contract){return sanitizeClaims(subjectBrief.editorialTitle||contract.name).text.toUpperCase();}
function resolveTextMode(choice,platform){if(platform==="Google Business"&&(!choice||choice==="automatic"))return "TEXT_MODE_NONE";return TEXT_MODES[choice]||TEXT_MODES.automatic;}
function platformZones(platform){const zones={Story:{textSafeArea:{top:.61,bottom:.72,left:.07,right:.93},logoSafeArea:{top:.75,bottom:.82,left:.22,right:.78}},Facebook:{textSafeArea:{top:.08,bottom:.22,left:.06,right:.64},logoSafeArea:{top:.24,bottom:.32,left:.10,right:.42}},"Instagram Square":{textSafeArea:{top:.60,bottom:.73,left:.08,right:.92},logoSafeArea:{top:.76,bottom:.84,left:.25,right:.75}},Instagram:{textSafeArea:{top:.62,bottom:.74,left:.08,right:.92},logoSafeArea:{top:.77,bottom:.85,left:.25,right:.75}},"Google Business":{textSafeArea:{top:.60,bottom:.64,left:.06,right:.56},logoSafeArea:{top:.67,bottom:.77,left:.10,right:.42}},Blog:{textSafeArea:{top:.12,bottom:.38,left:.54,right:.95},logoSafeArea:{top:.41,bottom:.54,left:.64,right:.85}},Bannière:{textSafeArea:{top:.16,bottom:.48,left:.045,right:.49},logoSafeArea:{top:.52,bottom:.66,left:.14,right:.34}}};const selected=zones[platform]||zones.Instagram;return {textZones:[`zone éditoriale ${platform}, séparée du logo`],...selected};}
function buildPosterStrategy({subjectBrief,contract,artDirection,platform,textChoice="automatic"}){const mode=resolveTextMode(textChoice,platform),title=mode==="TEXT_MODE_NONE"?"":titleFor(subjectBrief,contract),subtitle=["TEXT_MODE_EDITORIAL","TEXT_MODE_OFFER","TEXT_MODE_CAMPAIGN_KEY_VISUAL"].includes(mode)?(subjectBrief.editorialSubtitle||(contract.generic?"UNE EXPÉRIENCE SIGNÉE SDZ":sanitizeClaims(`DÉCOUVRIR ${contract.name}`).text.toUpperCase())):"",titleLines=platform==="Story"?storyTitleLines(title):semanticLines(title,3,22),subtitleLines=semanticLines(subtitle,2,28),focus=subjectBrief.requestedFocus||contract.recognition,zones=platformZones(platform);const role=contract.generic?contract.requiredAction:`${contract.requiredAction}; ${contract.people>=2?"praticien et bénéficiaire clairement présents":"bénéficiaire et produit officiel clairement lisibles"}`;const hierarchy=[`manifestation principale : ${focus}`,contract.generic?`action dérivée du sujet : ${contract.requiredAction}`:`réponse SDZ : ${contract.requiredAction}`,contract.practitionerGenderRequired?contract.practitionerIdentity:`transformation dans ${artDirection.artistic.locationFamily}`];const strategy={communicationGoal:subjectBrief.marketingObjective,coreTheme:subjectBrief.coreTheme,instantVisualMeaning:subjectBrief.physicalOrEmotionalManifestation,subjectManifestation:subjectBrief.physicalOrEmotionalManifestation,careOrSolutionManifestation:role,transformationNarrative:subjectBrief.transformationPromise,emotionalJourney:"état initial visible → évolution crédible → ouverture",mainSubject:`${contract.primarySubject}${subjectBrief.requestedFocus?`, attention portée à ${subjectBrief.requestedFocus}`:""}`,secondarySubject:contract.secondarySubject,tertiarySubject:hierarchy[2],visualHierarchy:hierarchy,environmentRole:`${artDirection.artistic.locationFamily} prolonge le sens de « ${subjectBrief.coreTheme} » sans masquer ${contract.recognition}`,artWorldFamily:artDirection.artistic.artWorldFamily,locationFamily:artDirection.artistic.locationFamily,architecturalStory:`${artDirection.artistic.architectureDescription} traduit spatialement ${subjectBrief.transformationPromise}`,fantasticStory:`${artDirection.artistic.fantasticPhenomenon}, relié à l’évolution du sujet`,lightingStory:`${artDirection.artistic.lightingNarrative}, concentrée sur ${focus} puis accompagnant la transformation`,compositionType:platform==="Story"?"Cinématographique":"Éditoriale",textMode:mode,title,subtitle,supportingLine:"",brandLine:"LA SANTÉ DES ZÈBRES — RAISMES",titleLines,subtitleLines,titleLineTarget:platform==="Story"?"2 à 4":"1 à 3",subtitleLineTarget:"1 à 2",...zones,logoPlacement:"zone dédiée selon le format",logoScale:"prominent",protectedSceneAreas:contract.generic?["élément narratif principal dérivé du sujet","identité SDZ","ouverture architecturale"]:["visage","mains actives","geste professionnel",focus,"matériel officiel","ouverture architecturale"],platformAdaptationRules:{Story:"verticale immersive, zones texte et logo distinctes",Facebook:"4:5 distinct",Instagram:"4:5 compact","Instagram Square":"recomposition carrée dédiée","Google Business":"sans texte par défaut",Blog:"16:9 éditorial","Bannière":"3:1 horizontal"},differentiationReason:artDirection.artistic.differentiationReason};return Object.freeze({...strategy,metrics:{titleWordCount:title.split(/\s+/).filter(Boolean).length,titleLineCount:titleLines.length,subtitleWordCount:subtitle.split(/\s+/).filter(Boolean).length,subtitleLineCount:subtitleLines.length,textDensityRatio:(title.length+subtitle.length)/(platform==="Story"?360:260),orphanWordDetected:[...titleLines,...subtitleLines].some(x=>WEAK_WORDS.has(x)),semanticBreakQuality:9,mobileReadabilityScore:9}});}
function buildResolvedPosterStrategy({subjectBrief,contract,artDirection,platform,textChoice="automatic"}){
 const mode=resolveTextMode(textChoice,platform);
 const title=mode==="TEXT_MODE_NONE"?"":titleFor(subjectBrief,contract);
 const subtitle=["TEXT_MODE_EDITORIAL","TEXT_MODE_OFFER","TEXT_MODE_CAMPAIGN_KEY_VISUAL"].includes(mode)?(subjectBrief.editorialSubtitle||(contract.generic?"UNE EXPÉRIENCE SIGNÉE SDZ":sanitizeClaims(`DÉCOUVRIR ${contract.name}`).text.toUpperCase())):"";
 const titleLines=platform==="Story"?storyTitleLines(title):semanticLines(title,3,22);
 const subtitleLines=semanticLines(subtitle,2,28);
 const focus=subjectBrief.visualFocus||subjectBrief.requestedFocus||subjectBrief.officialRecognition||contract.recognition;
 const zones=platformZones(platform);
 const role=contract.generic?subjectBrief.officialAction:`${contract.requiredAction}; ${contract.people>=2?"praticien et bénéficiaire clairement présents":"bénéficiaire et produit officiel clairement lisibles"}`;
 const hierarchy=[`manifestation principale : ${focus}`,contract.generic?`dynamique visuelle : ${subjectBrief.officialAction}`:`réponse SDZ : ${contract.requiredAction}`,contract.practitionerGenderRequired?contract.practitionerIdentity:`transformation dans ${artDirection.artistic.locationFamily}`];
 const strategy={communicationGoal:subjectBrief.marketingObjective,coreTheme:subjectBrief.coreTheme,instantVisualMeaning:subjectBrief.physicalOrEmotionalManifestation,subjectManifestation:subjectBrief.physicalOrEmotionalManifestation,careOrSolutionManifestation:role,transformationNarrative:subjectBrief.transformationPromise,emotionalJourney:"état initial visible → évolution crédible → ouverture",mainSubject:`${subjectBrief.visualPrimarySubject||contract.primarySubject}${subjectBrief.requestedFocus?`, attention portée à ${subjectBrief.requestedFocus}`:""}`,secondarySubject:subjectBrief.visualSecondarySubject||contract.secondarySubject,tertiarySubject:hierarchy[2],visualHierarchy:hierarchy,environmentRole:`${artDirection.artistic.locationFamily} prolonge le sens de « ${subjectBrief.coreTheme} » sans masquer le sujet principal : ${subjectBrief.officialRecognition}`,artWorldFamily:artDirection.artistic.artWorldFamily,locationFamily:artDirection.artistic.locationFamily,architecturalStory:`${artDirection.artistic.architectureDescription} traduit spatialement ${subjectBrief.transformationPromise}`,fantasticStory:`${artDirection.artistic.fantasticPhenomenon}, relié à l’évolution du sujet`,lightingStory:`${artDirection.artistic.lightingNarrative}, concentrée sur ${focus} puis accompagnant la transformation`,compositionType:platform==="Story"?"Cinématographique":"Éditoriale",textMode:mode,title,subtitle,supportingLine:"",brandLine:"LA SANTÉ DES ZÈBRES — RAISMES",titleLines,subtitleLines,titleLineTarget:platform==="Story"?"2 à 4":"1 à 3",subtitleLineTarget:"1 à 2",...zones,logoPlacement:"zone dédiée selon le format",logoScale:"prominent",protectedSceneAreas:contract.generic?subjectBrief.visualProtectedAreas:["visage","mains actives","geste professionnel",focus,"matériel officiel","ouverture architecturale"],platformAdaptationRules:{Story:"verticale immersive, zones texte et logo distinctes",Facebook:"4:5 distinct",Instagram:"4:5 compact","Instagram Square":"recomposition carrée dédiée","Google Business":"sans texte par défaut",Blog:"16:9 éditorial",Bannière:"3:1 horizontal"},differentiationReason:artDirection.artistic.differentiationReason};
 return Object.freeze({...strategy,metrics:{titleWordCount:title.split(/\s+/).filter(Boolean).length,titleLineCount:titleLines.length,subtitleWordCount:subtitle.split(/\s+/).filter(Boolean).length,subtitleLineCount:subtitleLines.length,textDensityRatio:(title.length+subtitle.length)/(platform==="Story"?360:260),orphanWordDetected:[...titleLines,...subtitleLines].some(x=>WEAK_WORDS.has(x)),semanticBreakQuality:9,mobileReadabilityScore:9}});
}
function buildLegacyProjection({subjectBrief,posterStrategy,artDirection,contract}){const selected=(artDirection.artistic.antiRepetitionElements||[]).filter(term=>normalize(`${artDirection.artistic.architectureDescription} ${artDirection.artistic.locationFamily}`).includes(normalize(term)));return Object.freeze({sceneFamily:artDirection.artistic.locationFamily,familleUnivers:artDirection.artistic.artWorldFamily,decor:artDirection.artistic.architectureDescription,architecture:artDirection.artistic.architectureDescription,environmentRole:posterStrategy.environmentRole,lumiere:posterStrategy.lightingStory,matieres:artDirection.artistic.dominantMaterials.join(", "),phenomeneFantastique:artDirection.artistic.fantasticPhenomenon,ideeVisuelle:`${posterStrategy.subjectManifestation} ; ${posterStrategy.environmentRole}`,sujetPrincipal:posterStrategy.mainSubject,sujetSecondaire:posterStrategy.secondarySubject,action:posterStrategy.careOrSolutionManifestation,pointDeTransformation:posterStrategy.transformationNarrative,texteImage:[posterStrategy.title,posterStrategy.subtitle].filter(Boolean).join(" | "),zoneTexte:posterStrategy.textZones.join(", "),zoneLogo:JSON.stringify(posterStrategy.logoSafeArea),messageCentral:posterStrategy.coreTheme,raisonDifferenceAvecHistorique:posterStrategy.differentiationReason,caracteristiquePrestationVisible:contract.recognition,compositionInterdite:[...artDirection.artistic.absoluteExclusions],negativePrompt:artDirection.artistic.absoluteExclusions.join(", "),selectedAntiRepetitionElements:selected});}
function buildResolvedLegacyProjection(args){const base=buildLegacyProjection(args);return args.contract.generic?Object.freeze({...base,caracteristiquePrestationVisible:args.subjectBrief.officialRecognition}):base;}
function relevanceScores(subjectBrief,posterStrategy,contract){const inactive=/silhouette seule|personne inactive|regardant.*paysage/i.test(posterStrategy.subjectManifestation),generic=/\bspa\b|décor vide/i.test(posterStrategy.environmentRole),care=contract.people<2||/praticien et bénéficiaire/i.test(posterStrategy.careOrSolutionManifestation);return {visualRelevanceScore:inactive?2:9,subjectReadabilityScore:inactive?2:9,brandCompatibilityScore:9,sceneSpecificityScore:generic?2:9,emotionalImpactScore:inactive?2:9,genericSceneRisk:generic?8:1,ready:!inactive&&!generic&&care};}
function buildPostCopyStrategy({platform,subjectBrief,posterStrategy,contract,history=[]}){const angles=["identification à une sensation","micro-récit","question directe","geste professionnel","invitation locale"],angle=subjectBrief.editorialKind==="institutional"?"invitation locale":angles[history.length%angles.length],google=platform==="Google Business",story=platform==="Story";const hook=subjectBrief.editorialKind==="institutional"?"Poussez la porte d’un lieu pensé pour accueillir chaque expérience avec attention.":subjectBrief.editorialKind==="event"?"Un nouveau rendez-vous se prépare à La Santé des Zèbres.":subjectBrief.editorialKind==="offer"?"Une attention singulière, présentée sans promesse ni avantage inventé.":story?`Et si « ${subjectBrief.coreTheme} » pouvait laisser place à une autre sensation ?`:`Quand « ${subjectBrief.coreTheme} » se fait sentir, un autre rythme peut être exploré.`;return Object.freeze({platform,communicationGoal:subjectBrief.marketingObjective,audienceIntent:subjectBrief.audienceProblem,emotionalHook:sanitizeClaims(hook).text,narrativeAngle:angle,verifiedFacts:subjectBrief.verifiedFacts||[],sensoryVocabulary:["présence","souffle","ouverture","lumière"],serviceExplanation:contract.generic?"Communication de La Santé des Zèbres, sans prestation imposée":`${contract.name}, proposée par La Santé des Zèbres`,validatedBenefits:[contract.emotion],localSeoIntent:"cabinet à Raismes, proche Valenciennes",primaryKeyword:contract.generic?"La Santé des Zèbres à Raismes":`${contract.name} à Raismes`,secondaryKeywords:["Raismes","proche Valenciennes","expérience personnalisée"],locationSignals:["cabinet à Raismes, proche Valenciennes"],practicalInformation:google?["11 cour Dupas, 59590 Raismes","06.84.40.69.54","la-sante-des-zebres.com"]:[],cta:story?"Réservez votre prestation !":"Échangeons sur l’expérience qui vous correspond.",hashtagStrategy:platform==="Instagram"?{max:5,items:["#Raismes","#BienEtre","#LaSanteDesZebres"]}:{max:0,items:[]},targetLength:google?"100 à 150 mots":story?"15 à 30 mots":platform==="Facebook"?"140 à 220 mots":"90 à 160 mots",paragraphRhythm:story?"une phrase et un CTA":"paragraphes courts et aérés",emojiPolicy:"rare et utile",prohibitedClaims:["diagnostic","guérison","promesse médicale","tarif ou durée non validés"],differentiationReason:`Angle ${angle}, différent des ${history.length} textes récents`,controls:{keywordStuffingRisk:1,genericOpeningRisk:1,platformMismatchRisk:1,medicalClaimRisk:1,duplicateCopyRisk:1,localSeoPresence:true,ctaClarity:9,emotionalImpact:9,readabilityScore:9,unsupportedFactRisk:1,exactServiceNamePreserved:true,outdatedLinkRisk:0}});}
function buildCampaignCreativeDirection({posterStrategy,postCopyStrategy,contract}){return Object.freeze({service:contract?.name,centralIdea:posterStrategy.coreTheme,artWorld:posterStrategy.artWorldFamily,locationFamily:posterStrategy.locationFamily,palette:"noir profond et or noble",lighting:posterStrategy.lightingStory,visualVocabulary:[posterStrategy.architecturalStory,posterStrategy.fantasticStory],centralMessage:posterStrategy.title,emotionalArc:posterStrategy.emotionalJourney,seoAngle:postCopyStrategy.localSeoIntent,primaryKeywords:[postCopyStrategy.primaryKeyword],principalCta:postCopyStrategy.cta,consistencyRules:["même monde","même promesse autorisée","informations métier identiques","layouts distincts"]});}

module.exports={TEXT_MODES,GOLDEN_TARGET,CLAIM_RULES,inferSubjectBrief,editorialInterpretation,extractFacts,semanticLines,resolveTextMode,sanitizeClaims,buildPosterStrategy:buildResolvedPosterStrategy,buildLegacyProjection:buildResolvedLegacyProjection,relevanceScores,buildPostCopyStrategy,buildCampaignCreativeDirection,conciseTheme,extractExplicitScene,buildSubjectVisualDirective};
