'use strict';
const fs=require('node:fs');

function read(path){return fs.readFileSync(path,'utf8');}
function write(path,content){fs.mkdirSync(require('node:path').dirname(path),{recursive:true});fs.writeFileSync(path,content);}
function replace(path,from,to,label){const s=read(path);if(!s.includes(from))throw new Error(`Missing marker ${label} in ${path}`);write(path,s.replace(from,to));}

// 1) Dedicated image-copy strategy: the user's long subject is semantic input, not poster copy.
write('netlify/functions/_shared/v4-image-copy-strategy.js',`"use strict";

const VERSION="4.0.0-emotional-image-copy";
function clean(value){return String(value||"").replace(/\\s+/g," ").trim();}
function normalize(value){return clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();}
function upper(value){return clean(value).toLocaleUpperCase("fr-FR");}
function safe(value){return clean(value).replace(/\\b(guéri(?:son|r)?|diagnosti(?:c|quer)|thérapeutique|médical(?:e)?|garanti(?:e|s)?)\\b/gi,"").replace(/\\s+/g," ").trim();}
function defaultHeadline(subjectBrief,contract){
 const raw=normalize(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||"");
 if(/dos|dorsal|lombaire|blocage|lourdeur/.test(raw))return "LIBÉREZ CE QUE VOTRE DOS RETIENT";
 if(/cervical|nuque|occiput|migraine/.test(raw))return "RELÂCHEZ CE QUI PÈSE";
 if(/stress|mental|souffler|saturation|tension|lâcher|lacher/.test(raw))return "RETROUVEZ DE L’ESPACE";
 if(/fatigue|épuis|epuis|élan|elan|énergie|energie|vitalité|vitalite/.test(raw))return "RETROUVEZ VOTRE ÉLAN";
 if(/minceur|rafferm|légèreté|legerete/.test(raw))return "VERS PLUS DE LÉGÈRETÉ";
 if(/cadeau|offrir|bon cadeau/.test(raw))return "OFFREZ PLUS QU’UN MOMENT";
 if(/animal|chien|chat|ferme|cheval/.test(raw))return "UN MOMENT DE CALME POUR LUI AUSSI";
 const existing=safe(subjectBrief.editorialTitle||"");
 if(existing&&existing.length<=42&&!/douleur|blocage|sensation|lourdeur/i.test(existing))return upper(existing);
 const service=safe(contract?.name||"");
 if(service&&service.length<=32)return upper(service);
 return "PRENEZ LE TEMPS DE VOUS RETROUVER";
}
function buildImageCopyStrategy({subjectBrief={},contract={},platform="Instagram",textChoice="automatic"}={}){
 const google=platform==="Google Business",none=textChoice==="none"||textChoice==="aucun";
 if(google||none)return Object.freeze({version:VERSION,headline:"",subheadline:"",rewritten:false,reason:google?"google-no-overlay":"text-disabled"});
 const raw=clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||"");
 const headline=defaultHeadline(subjectBrief,contract);
 let subheadline="";
 if(contract&&!contract.generic&&contract.name){const service=upper(contract.name);if(service!==headline&&service.length<=30)subheadline=service;}
 const normalizedRaw=upper(safe(raw));
 return Object.freeze({version:VERSION,headline,subheadline,rewritten:normalizedRaw!==headline&&normalizedRaw!==[headline,subheadline].filter(Boolean).join(" | "),reason:"emotional-marketing-rewrite",sourceSubject:raw});
}
module.exports={VERSION,buildImageCopyStrategy};
`);

// 2) Pipeline: signed copy strategy becomes the poster text authority.
replace('netlify/functions/_shared/v3-pipeline.js',
'const {inferSubjectBrief,buildPosterStrategy,buildLegacyProjection,relevanceScores,buildPostCopyStrategy,buildCampaignCreativeDirection}=require("./v3-creative-strategy");',
'const {inferSubjectBrief,buildPosterStrategy,buildLegacyProjection,relevanceScores,buildPostCopyStrategy,buildCampaignCreativeDirection,semanticLines}=require("./v3-creative-strategy");\\nconst {buildImageCopyStrategy}=require("./v4-image-copy-strategy");',
'pipeline imports');
replace('netlify/functions/_shared/v3-pipeline.js',
' const posterStrategy=buildPosterStrategy({subjectBrief,contract,artDirection,platform:input.platform,textChoice:input.textChoice});',
' const imageCopyStrategy=buildImageCopyStrategy({subjectBrief,contract,platform:input.platform,textChoice:input.textChoice});\\n const basePosterStrategy=buildPosterStrategy({subjectBrief,contract,artDirection,platform:input.platform,textChoice:input.textChoice});\\n const copyTitle=imageCopyStrategy.headline,copySubtitle=imageCopyStrategy.subheadline,titleLines=input.platform==="Story"?semanticLines(copyTitle,4,18):semanticLines(copyTitle,3,22),subtitleLines=semanticLines(copySubtitle,2,28);\\n const posterStrategy=Object.freeze({...basePosterStrategy,title:copyTitle,subtitle:copySubtitle,titleLines,subtitleLines,imageCopyStrategy,metrics:{...basePosterStrategy.metrics,titleWordCount:copyTitle.split(/\\s+/).filter(Boolean).length,titleLineCount:titleLines.length,subtitleWordCount:copySubtitle.split(/\\s+/).filter(Boolean).length,subtitleLineCount:subtitleLines.length,textDensityRatio:(copyTitle.length+copySubtitle.length)/(input.platform==="Story"?360:260)}});',
'pipeline copy authority');
replace('netlify/functions/_shared/v3-pipeline.js',
'  posterStrategy:plan.posterStrategy,',
'  posterStrategy:plan.posterStrategy,\\n  imageCopyStrategy:plan.imageCopyStrategy,',
'plan identity copy');
replace('netlify/functions/_shared/v3-pipeline.js',
'  version:4,\\n  contract,subjectBrief,sceneIntent,posterStrategy,legacyProjection,postCopyStrategy,',
'  version:4,\\n  contract,subjectBrief,sceneIntent,posterStrategy,imageCopyStrategy,legacyProjection,postCopyStrategy,',
'plan object copy');
replace('netlify/functions/_shared/v3-pipeline.js',
'  preflight:{...publicPreflight(artDirection),subjectBrief,sceneIntent,posterStrategy,postCopyStrategy,campaignCreativeDirection,consistencyReport,freeScores},',
'  preflight:{...publicPreflight(artDirection),subjectBrief,sceneIntent,posterStrategy,imageCopyStrategy,postCopyStrategy,campaignCreativeDirection,consistencyReport,freeScores},',
'preflight copy');

// 3) Server authority: never return a premium raw image when analysis/composition fails.
write('netlify/functions/_shared/v3-executor.js',`"use strict";
const {finalizeV3}=require("./v3-pipeline");
const {assessQuality}=require("./v3-quality");

async function executeV3Pipeline({plan,rawImageBuffer,analyzeImage,composeImage,preserveRaw,brandComposition}){
 await preserveRaw(rawImageBuffer);
 let finalization;
 try{
  const actual=await analyzeImage(rawImageBuffer,plan);
  const lowerProtected=plan.artDirection.platform==="Story"&&(actual.protectedZones||[]).some(zone=>/bottom|inférieur|bas/i.test(String(zone)))&&!(actual.calmZones||[]).some(zone=>/bottom|inférieur|bas/i.test(String(zone)));
  finalization=finalizeV3(plan,actual,{imageExists:true,paletteDrift:actual.paletteDrift,contrastValid:actual.availableContrast>=.25,gazeHierarchyValid:true,thumbnailImpact:actual.density<.92,protectedCollision:lowerProtected});
 }catch(error){
  const failure=new Error(`Analyse image V4 impossible : ${String(error.message||error)}`);failure.code="V4_ANALYSIS_FAILED";throw failure;
 }
 try{
  const imageBuffer=await composeImage(rawImageBuffer,finalization.layout,brandComposition);
  const manifest=imageBuffer?.compositionManifest||null;
  if(!manifest||manifest.finalCompositionEngine!=="sharp-server")throw new Error("Manifeste Sharp serveur absent.");
  const measured=manifest;
  finalization={...finalization,compositionManifest:manifest,quality:assessQuality({contract:plan.contract,sceneIntent:plan.sceneIntent,analysis:finalization.analysis,composition:{imageExists:true,paletteDrift:finalization.analysis.paletteDrift,contrastValid:finalization.analysis.availableContrast>=.25,gazeHierarchyValid:measured.hierarchyValid!==false,thumbnailImpact:finalization.analysis.density<.92,logoIntegrity:measured.logoWithinCanvas!==false,logoAssetIntegrity:measured.logoAssetIntegrity!==false,logoFringeDetected:measured.logoFringeDetected===true,logoScaleValid:measured.logoScaleValid!==false,marginsValid:measured.marginsValid!==false,textWithinCanvas:measured.textWithinCanvas!==false&&measured.titleExact!==false&&measured.subtitleExact!==false,protectedCollision:measured.zonesDisjoint===false,logoRectangleOpaque:measured.logoRectangleOpaque===true}})};
  return {imageBuffer,brandComposited:true,finalCompositionEngine:"sharp-server",finalization};
 }catch(error){
  const failure=new Error(`Composition Sharp V4 impossible : ${String(error.message||error)}`);failure.code="V4_SHARP_COMPOSITION_FAILED";failure.finalization=finalization;throw failure;
 }
}
module.exports={executeV3Pipeline};
`);

// 4) Adaptive placement from calm zones; brand lockup goes to the opposite side.
replace('netlify/functions/_shared/v3-layout-engine.js',
'function chooseLayout({platform,contract,analysis}){\\n const normalized=normalizePlatform(platform);const t=PLATFORM_TEMPLATES[normalized];if(!t)throw new Error(`Plateforme V3 inconnue : ${platform}`);',
`function adaptiveSafeAreas(platform,analysis){
 const normalized=normalizePlatform(platform);if(normalized==="Google Business")return null;
 const raw=(analysis.calmZones||[]).map(x=>String(x).toLowerCase()).join(" ");
 const left=/gauche|left/.test(raw),right=/droite|right/.test(raw),top=/haut|sup|top/.test(raw),bottom=/bas|inf|bottom/.test(raw);
 const portrait=normalized==="Story"||normalized==="Instagram Portrait"||normalized==="Instagram Square"||normalized==="Facebook";
 if(portrait){
  if(top&&left)return {textSafeArea:{top:.08,bottom:.34,left:.07,right:.58},logoSafeArea:{top:.72,bottom:.95,left:.55,right:.93},placement:"top-left/opposite-brand"};
  if(top&&right)return {textSafeArea:{top:.08,bottom:.34,left:.42,right:.93},logoSafeArea:{top:.72,bottom:.95,left:.07,right:.45},placement:"top-right/opposite-brand"};
  if(bottom&&left)return {textSafeArea:{top:.48,bottom:.67,left:.07,right:.58},logoSafeArea:{top:.72,bottom:.95,left:.55,right:.93},placement:"lower-left/opposite-brand"};
  if(bottom&&right)return {textSafeArea:{top:.48,bottom:.67,left:.42,right:.93},logoSafeArea:{top:.72,bottom:.95,left:.07,right:.45},placement:"lower-right/opposite-brand"};
  if(right)return {textSafeArea:{top:.28,bottom:.55,left:.43,right:.93},logoSafeArea:{top:.72,bottom:.95,left:.07,right:.45},placement:"mid-right/opposite-brand"};
  if(left)return {textSafeArea:{top:.28,bottom:.55,left:.07,right:.57},logoSafeArea:{top:.72,bottom:.95,left:.55,right:.93},placement:"mid-left/opposite-brand"};
  return {textSafeArea:{top:.56,bottom:.70,left:.08,right:.92},logoSafeArea:{top:.73,bottom:.95,left:.27,right:.73},placement:"safe-default"};
 }
 if(left)return {textSafeArea:{top:.12,bottom:.48,left:.05,right:.48},logoSafeArea:{top:.52,bottom:.82,left:.61,right:.92},placement:"left/opposite-brand"};
 if(right)return {textSafeArea:{top:.12,bottom:.48,left:.52,right:.95},logoSafeArea:{top:.52,bottom:.82,left:.08,right:.39},placement:"right/opposite-brand"};
 return {textSafeArea:{top:.12,bottom:.46,left:.08,right:.58},logoSafeArea:{top:.50,bottom:.82,left:.62,right:.92},placement:"safe-default"};
}
function chooseLayout({platform,contract,analysis}){
 const normalized=normalizePlatform(platform);const t=PLATFORM_TEMPLATES[normalized];if(!t)throw new Error(\`Plateforme V3 inconnue : \${platform}\`);`,
'layout adaptive helper');
replace('netlify/functions/_shared/v3-layout-engine.js',
' return {platform:normalized,family,variant:`${family}-${t.ratioVariant}-${analysis.calmZones[0]||"safe"}`,template:t,rationale:`Choix sur image réelle : ${analysis.peopleCount} personne(s), densité ${analysis.density}, zone calme ${analysis.calmZones[0]||"marge sûre"}, moment dramatique ${analysis.dramaticMomentPresent?"oui":"non"}.`};\\n}',
' const adaptive=adaptiveSafeAreas(normalized,analysis)||{};\\n return {platform:normalized,family,variant:`${family}-${t.ratioVariant}-${analysis.calmZones[0]||"safe"}`,template:t,...adaptive,rationale:`Choix sur image réelle : ${analysis.peopleCount} personne(s), densité ${analysis.density}, zone calme ${analysis.calmZones[0]||"marge sûre"}, placement ${adaptive.placement||"spécifique Google"}, moment dramatique ${analysis.dramaticMomentPresent?"oui":"non"}.`};\\n}',
'layout return adaptive');
replace('netlify/functions/_shared/v3-layout-engine.js',
'module.exports={PLATFORM_TEMPLATES,normalizePlatform,analyzeActualImage,chooseLayout};',
'module.exports={PLATFORM_TEMPLATES,normalizePlatform,analyzeActualImage,adaptiveSafeAreas,chooseLayout};',
'layout export');

// 5) Brand compositor: adaptive layout wins over fixed premium defaults; explicit server-engine proof.
replace('netlify/functions/_shared/brand-compositor.js',
'  const spec=template.lockup,margin=Math.max(Math.round(width*.06),Math.round(width*template.margins)),verticalMargin=Math.max(24,Math.round(height*.035)),textSafe=posterStrategy?.textSafeArea,logoSafe=posterStrategy?.logoSafeArea,premium=premiumBrandLockupFor(p);',
'  const spec=template.lockup,margin=Math.max(Math.round(width*.06),Math.round(width*template.margins)),verticalMargin=Math.max(24,Math.round(height*.035)),textSafe=selectedLayout?.textSafeArea||posterStrategy?.textSafeArea,logoSafe=selectedLayout?.logoSafeArea||posterStrategy?.logoSafeArea,premium=premiumBrandLockupFor(p);',
'compositor adaptive safe source');
replace('netlify/functions/_shared/brand-compositor.js',
'  if(premium){y=Math.max(verticalMargin,Math.round(height*premium.textTop));textBottom=Math.min(height-verticalMargin,Math.round(height*premium.textBottom));}',
'  if(premium&&!textSafe){y=Math.max(verticalMargin,Math.round(height*premium.textTop));textBottom=Math.min(height-verticalMargin,Math.round(height*premium.textBottom));}',
'compositor premium text fallback');
replace('netlify/functions/_shared/brand-compositor.js',
'  if(premium){logoArea.left=Math.round(width*premium.logoLeft);logoArea.right=Math.round(width*premium.logoRight);logoArea.top=textBottom+Math.round(height*.008);logoArea.bottom=height-verticalMargin;}',
'  if(premium&&!logoSafe){logoArea.left=Math.round(width*premium.logoLeft);logoArea.right=Math.round(width*premium.logoRight);logoArea.top=textBottom+Math.round(height*.008);logoArea.bottom=height-verticalMargin;}',
'compositor premium logo fallback');
replace('netlify/functions/_shared/brand-compositor.js',
' const manifest=Object.freeze({version:COMPOSITOR_VERSION,typographyEngineVersion:TYPOGRAPHY_ENGINE_VERSION,platform:normalizePlatform(platform),',
' const manifest=Object.freeze({version:COMPOSITOR_VERSION,typographyEngineVersion:TYPOGRAPHY_ENGINE_VERSION,finalCompositionEngine:"sharp-server",platform:normalizePlatform(platform),',
'compositor engine manifest');

// 6) Worker: only publish a result after proven Sharp composition; keep raw for diagnosis on failure.
replace('netlify/functions/process-image-job-background.js',
'      v3Finalization=executed.finalization;brandComposited=executed.brandComposited;b64=executed.imageBuffer.toString("base64");url=null;',
'      v3Finalization=executed.finalization;brandComposited=executed.brandComposited;const finalCompositionEngine=executed.finalCompositionEngine||v3Finalization?.compositionManifest?.finalCompositionEngine||null;if(!brandComposited||finalCompositionEngine!=="sharp-server"||!executed.imageBuffer)throw new Error("Autorité finale Sharp serveur non prouvée.");b64=executed.imageBuffer.toString("base64");url=null;',
'worker sharp authority');
replace('netlify/functions/process-image-job-background.js',
'    const resultKey=`jobs/${jobId}/result`;\\n    try{await store.set(resultKey,JSON.stringify({b64,url,usedReference,brandComposited,v3Finalization}));}',
'    const finalCompositionEngine=v3Finalization?.compositionManifest?.finalCompositionEngine||(brandComposited?"sharp-server":null);\\n    if(v3Plan&&finalCompositionEngine!=="sharp-server")throw new Error("Résultat premium sans moteur Sharp serveur.");\\n    const resultKey=`jobs/${jobId}/result`;\\n    try{await store.set(resultKey,JSON.stringify({b64,url,usedReference,brandComposited,finalCompositionEngine,v3Finalization}));}',
'worker stored engine');
replace('netlify/functions/process-image-job-background.js',
'    await safeSetJobStatus(store,jobId,{status:"completed",error:null,resultKey,rawResultKey,usedReference,referenceFallbackReason:null,brandComposited,v3Plan,v3Finalization,artFingerprint,referenceAudit,costAudit,requestedQuality,effectiveQuality:quality,requestedSize,effectiveSize:size,imageGenerationCallCount:1,usage});',
'    await safeSetJobStatus(store,jobId,{status:"completed",error:null,resultKey,rawResultKey,usedReference,referenceFallbackReason:null,brandComposited,finalCompositionEngine,v3Plan,v3Finalization,artFingerprint,referenceAudit,costAudit,requestedQuality,effectiveQuality:quality,requestedSize,effectiveSize:size,imageGenerationCallCount:1,usage});',
'worker job engine');

// 7) Polling + free recomposition propagate the engine proof.
replace('netlify/functions/get-image-job.js',
'            brandComposited: job.brandComposited === true,',
'            brandComposited: job.brandComposited === true,\\n            finalCompositionEngine: job.finalCompositionEngine || job.v3Finalization?.compositionManifest?.finalCompositionEngine || null,',
'poll engine');
replace('netlify/functions/recompose-image-job.js',
'    await jobs.set(resultKey,JSON.stringify({b64:final.toString("base64"),url:null,brandComposited:true,recomposedFrom:recoverySourceJobId,compositionManifest}));',
'    const finalCompositionEngine=compositionManifest?.finalCompositionEngine||"sharp-server";\\n    await jobs.set(resultKey,JSON.stringify({b64:final.toString("base64"),url:null,brandComposited:true,finalCompositionEngine,recomposedFrom:recoverySourceJobId,compositionManifest}));',
'recompose result engine');
replace('netlify/functions/recompose-image-job.js',
'    await jobs.set(`jobs/${derivedJobId}`,JSON.stringify({jobId:derivedJobId,status:"completed",createdAt:Date.now(),updatedAt:Date.now(),resultKey,rawResultKey:source.rawResultKey,v3Plan:source.v3Plan,v3Finalization:{analysis,layout,quality,compositionManifest},recomposedFrom:recoverySourceJobId,costAudit:buildCostAudit({mode:"recompose",visionUsage:false,imageCalls:0})}));',
'    await jobs.set(`jobs/${derivedJobId}`,JSON.stringify({jobId:derivedJobId,status:"completed",createdAt:Date.now(),updatedAt:Date.now(),resultKey,rawResultKey:source.rawResultKey,brandComposited:true,finalCompositionEngine,v3Plan:source.v3Plan,v3Finalization:{analysis,layout,quality,compositionManifest},recomposedFrom:recoverySourceJobId,costAudit:buildCostAudit({mode:"recompose",visionUsage:false,imageCalls:0})}));',
'recompose job engine');
replace('netlify/functions/recompose-image-job.js',
'    return json(200,{ok:true,jobId:derivedJobId,recoverySourceJobId,resultUrl:`/.netlify/functions/get-image-result?jobId=${derivedJobId}`,platform,layout,quality,compositionManifest,costAudit:buildCostAudit({mode:"recompose",visionUsage:false,imageCalls:0}),imageGenerationCalls:0});',
'    return json(200,{ok:true,jobId:derivedJobId,recoverySourceJobId,resultUrl:`/.netlify/functions/get-image-result?jobId=${derivedJobId}`,platform,layout,quality,compositionManifest,brandComposited:true,finalCompositionEngine,costAudit:buildCostAudit({mode:"recompose",visionUsage:false,imageCalls:0}),imageGenerationCalls:0});',
'recompose response engine');

// 8) Browser: premium V4 never falls back to Canvas, including refused quality cases.
replace('index.html',
'        brandComposited: statusData.result.brandComposited===true,',
'        brandComposited: statusData.result.brandComposited===true,\\n        finalCompositionEngine: statusData.result.finalCompositionEngine || statusData.result.v3Finalization?.compositionManifest?.finalCompositionEngine || null,',
'client poll engine');
replace('index.html',
'  const serverBrandPath = flow.serverBrandCompositionUsed===true;\\n  const logoInScene = serverBrandPath && flow.brandComposited===true;\\n  if(serverBrandPath && !logoInScene) throw new Error("Composition serveur Sharp absente : aucun fallback Canvas n’est autorisé pour une génération V4.");',
'  const serverBrandPath = flow.serverBrandCompositionUsed===true;\\n  const logoInScene = serverBrandPath && flow.brandComposited===true;\\n  const finalCompositionEngine = flow.finalCompositionEngine || flow.v3Finalization?.compositionManifest?.finalCompositionEngine || null;\\n  if(flow.v3Plan && (!serverBrandPath || !logoInScene || finalCompositionEngine!=="sharp-server")) throw new Error("Composition serveur Sharp absente ou non prouvée : aucun fallback Canvas n’est autorisé pour une génération V4.");',
'client strict authority');
replace('index.html',
'    serverBrandCompositionUsed:true, brandComposited, imageUsage,',
'    serverBrandCompositionUsed:true, brandComposited, finalCompositionEngine: providerResult.finalCompositionEngine || providerResult.v3Finalization?.compositionManifest?.finalCompositionEngine || null, imageUsage,',
'client completed engine');
replace('index.html',
'  const finalizedItem = v3Rejected ? {dataUrl:phaseB.dataUrl,logoApplied:false,headlineApplied:false,layoutReport:item.v3Finalization.layout||null,overlayWarning:"Image V3 refusée par le contrôle qualité — photographie brute conservée."} : await finalizeGeneratedImage({',
'  const finalizedItem = await finalizeGeneratedImage({',
'campaign remove raw fallback');
replace('index.html',
'    brandComposited:phaseB.brandComposited===true,\\n  });',
'    brandComposited:phaseB.brandComposited===true,\\n    finalCompositionEngine:phaseB.finalCompositionEngine||phaseB.v3Finalization?.compositionManifest?.finalCompositionEngine||null,\\n    v3Plan:phaseB.v3Plan||item.v3Plan||null,\\n    v3Finalization:phaseB.v3Finalization||item.v3Finalization||null,\\n  });',
'campaign finalizer engine');
replace('index.html',
'  item.serverBrandCompositionUsed = true; item.brandComposited = phaseB.brandComposited===true;',
'  item.serverBrandCompositionUsed = true; item.brandComposited = phaseB.brandComposited===true; item.finalCompositionEngine=phaseB.finalCompositionEngine||phaseB.v3Finalization?.compositionManifest?.finalCompositionEngine||null;',
'campaign store engine');
replace('index.html',
'    (finalizedItem.layoutReport&&!finalizedItem.layoutReport.skipped\\n      ? ` — Canvas premium ✓ (${finalizedItem.layoutReport.textZone||"sans texte"} / ${finalizedItem.layoutReport.logoZone||"sans logo"})` : "") +',
'    (item.finalCompositionEngine==="sharp-server" ? " — Sharp serveur ✓" : "") +',
'campaign label sharp');

// 9) Tests: exact copy rewrite, Google special mode, and strict server authority.
write('tests/v4-image-copy-strategy.test.js',`"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {buildImageCopyStrategy}=require("../netlify/functions/_shared/v4-image-copy-strategy");
const {planV3}=require("../netlify/functions/_shared/v3-pipeline");

test("le sujet dorsal réel devient une accroche émotionnelle courte au lieu d'un pavé brut",()=>{
 const copy=buildImageCopyStrategy({subjectBrief:{exactUserRequest:"Douleurs dorsales, blocage, sensations de lourdeur",coreTheme:"Douleurs dorsales, blocage, sensations de lourdeur"},contract:{name:"Massage dos/zone",generic:false},platform:"Story"});
 assert.equal(copy.headline,"LIBÉREZ CE QUE VOTRE DOS RETIENT");
 assert.equal(copy.subheadline,"MASSAGE DOS/ZONE");
 assert.equal(copy.rewritten,true);
 assert.doesNotMatch(copy.headline,/DOULEURS DORSALES, BLOCAGE, SENSATIONS DE LOURDEUR/i);
});

test("Google Business garde zéro headline et zéro subheadline",()=>{
 const copy=buildImageCopyStrategy({subjectBrief:{exactUserRequest:"Douleurs dorsales, blocage, sensations de lourdeur"},contract:{name:"Massage dos/zone",generic:false},platform:"Google Business"});
 assert.equal(copy.headline,"");assert.equal(copy.subheadline,"");
});

test("le plan V4 exact Massage dos/zone signe l'accroche marketing et garde SceneIntent comme prompt fournisseur",()=>{
 const plan=planV3({service:"Massage dos/zone",platform:"Story",subject:"Douleurs dorsales, blocage, sensations de lourdeur",selectedRegisters:["Cinématographie","Architecture","Fantastique"],costMode:"test"});
 assert.equal(plan.posterStrategy.title,"LIBÉREZ CE QUE VOTRE DOS RETIENT");
 assert.equal(plan.posterStrategy.subtitle,"MASSAGE DOS/ZONE");
 assert.equal(plan.imageCopyStrategy.rewritten,true);
 assert.equal(plan.photoBrief.prompt,plan.sceneIntent.providerPrompt);
 assert.ok(plan.posterStrategy.title.length<45);
});
`);

let authority=read('tests/v4-server-brand-authority.test.js');
authority=authority.replace('assert.match(index,/if\\(serverBrandPath && !logoInScene\\) throw new Error\\("Composition serveur Sharp absente/);','assert.match(index,/finalCompositionEngine!=="sharp-server"/);\\n  assert.match(index,/aucun fallback Canvas n’est autorisé/);');
authority=authority.replace('assert.equal(manifest.logoRectangleOpaque,false,JSON.stringify(manifest));','assert.equal(manifest.logoRectangleOpaque,false,JSON.stringify(manifest));\\n  assert.equal(manifest.finalCompositionEngine,"sharp-server");');
write('tests/v4-server-brand-authority.test.js',authority);

console.log('Direct V4 finalization patch applied');
