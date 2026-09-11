'use strict';
const fs=require('node:fs');
function patch(path,from,to,label){let s=fs.readFileSync(path,'utf8');if(!s.includes(from))throw new Error(`Missing ${label} in ${path}`);fs.writeFileSync(path,s.replace(from,to));}

patch('netlify/functions/_shared/brand-compositor.js',
'const spec=template.lockup,margin=Math.max(Math.round(width*.06),Math.round(width*template.margins)),verticalMargin=Math.max(24,Math.round(height*.035)),textSafe=selectedLayout?.textSafeArea||posterStrategy?.textSafeArea,logoSafe=selectedLayout?.logoSafeArea||posterStrategy?.logoSafeArea,premium=premiumBrandLockupFor(p);',
'const spec=template.lockup,margin=Math.max(Math.round(width*.06),Math.round(width*template.margins)),verticalMargin=Math.max(24,Math.round(height*.035)),premium=premiumBrandLockupFor(p),textSafe=selectedLayout?.textSafeArea||(premium?null:posterStrategy?.textSafeArea),logoSafe=selectedLayout?.logoSafeArea||(premium?null:posterStrategy?.logoSafeArea);',
'premium adaptive fallback');

patch('netlify/functions/_shared/v4-image-copy-strategy.js',
'function defaultHeadline(subjectBrief,contract){\n const raw=normalize(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||"");',
'function defaultHeadline(subjectBrief,contract){\n const existing=safe(subjectBrief.editorialTitle||"");\n if(subjectBrief.editorialKind==="institutional"&&existing&&existing.length<=42)return upper(existing);\n const raw=normalize(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||"");',
'institutional headline precedence');
patch('netlify/functions/_shared/v4-image-copy-strategy.js',
' const existing=safe(subjectBrief.editorialTitle||"");\n if(existing&&existing.length<=42&&!/douleur|blocage|sensation|lourdeur/i.test(existing))return upper(existing);',
' if(existing&&existing.length<=42&&!/douleur|blocage|sensation|lourdeur/i.test(existing))return upper(existing);',
'deduplicate existing headline');
patch('netlify/functions/_shared/v4-image-copy-strategy.js',
' let subheadline="";\n if(contract&&!contract.generic&&contract.name){const service=upper(contract.name);if(service!==headline&&service.length<=30)subheadline=service;}',
' let subheadline="";\n const editorialSub=safe(subjectBrief.editorialSubtitle||"");\n if(subjectBrief.editorialKind==="institutional"&&editorialSub&&editorialSub.length<=48)subheadline=upper(editorialSub);\n else if(contract&&!contract.generic&&contract.name){const service=upper(contract.name);if(service!==headline&&service.length<=30)subheadline=service;}',
'institutional subtitle precedence');
patch('netlify/functions/_shared/v4-image-copy-strategy.js',
' return Object.freeze({version:VERSION,headline,subheadline,rewritten:normalizedRaw!==headline&&normalizedRaw!==[headline,subheadline].filter(Boolean).join(" | "),reason:"emotional-marketing-rewrite",sourceSubject:raw});',
' const effectiveSubheadline=textChoice==="title"?"":subheadline;\n return Object.freeze({version:VERSION,headline,subheadline:effectiveSubheadline,rewritten:normalizedRaw!==headline&&normalizedRaw!==[headline,effectiveSubheadline].filter(Boolean).join(" | "),reason:"emotional-marketing-rewrite",sourceSubject:raw});',
'title-only mode');

patch('tests/v3-pipeline.test.js',
'composeImage:async(buffer,layout)=>{composedLayout=layout;return buffer;},brandComposition:{enabled:true}});assert.equal(preserved,true);assert.equal(result.finalization.quality.ok,true);assert.ok(composedLayout);assert.equal(result.brandComposited,true);',
'composeImage:async(buffer,layout)=>{composedLayout=layout;const composed=Buffer.from(buffer);composed.compositionManifest={finalCompositionEngine:"sharp-server"};return composed;},brandComposition:{enabled:true}});assert.equal(preserved,true);assert.equal(result.finalization.quality.ok,true);assert.ok(composedLayout);assert.equal(result.brandComposited,true);assert.equal(result.finalCompositionEngine,"sharp-server");',
'integrated pipeline manifest mock');

const oldSharpFailure='test("un échec Sharp conserve la photo et n\'annule pas le texte indépendant",async()=>{const raw=Buffer.from("raw-photo");const plan=require("../netlify/functions/_shared/v3-pipeline").planV3({service:"Offre Sylver",platform:"Facebook"});let textSaved=false;const textTask=Promise.resolve().then(()=>{textSaved=true;return "post conservé";});const result=await executeV3Pipeline({plan,rawImageBuffer:raw,preserveRaw:async()=>{},analyzeImage:async()=>({peopleCount:2,identityCount:2,sameBeneficiary:true,samePractitioner:true,foreignPersonPresent:false,practitionerGender:"male",requiredActionVisible:true,businessCompliance:true,subjectMatchesRequest:true,productFidelity:true,cinematicPosterRead:true,threePlaneDepth:true,brandSafeZoneAvailable:true,compositeStages:["Abhyanga","PSiO"],equipment:[],density:.2,availableContrast:.8}),composeImage:async()=>{throw new Error("sharp failure");},brandComposition:{enabled:true}});await textTask;assert.equal(result.imageBuffer,raw);assert.equal(result.finalization.quality.technical.ok,false);assert.equal(textSaved,true);});';
const newSharpFailure='test("un échec Sharp conserve le brut pour diagnostic, échoue explicitement et n\'annule pas le texte indépendant",async()=>{const raw=Buffer.from("raw-photo");const plan=require("../netlify/functions/_shared/v3-pipeline").planV3({service:"Offre Sylver",platform:"Facebook"});let textSaved=false,preserved=false;const textTask=Promise.resolve().then(()=>{textSaved=true;return "post conservé";});await assert.rejects(()=>executeV3Pipeline({plan,rawImageBuffer:raw,preserveRaw:async buffer=>{preserved=buffer.equals(raw);},analyzeImage:async()=>({peopleCount:2,identityCount:2,sameBeneficiary:true,samePractitioner:true,foreignPersonPresent:false,practitionerGender:"male",requiredActionVisible:true,businessCompliance:true,subjectMatchesRequest:true,productFidelity:true,cinematicPosterRead:true,threePlaneDepth:true,brandSafeZoneAvailable:true,compositeStages:["Abhyanga","PSiO"],equipment:[],density:.2,availableContrast:.8}),composeImage:async()=>{throw new Error("sharp failure");},brandComposition:{enabled:true}}),error=>error&&error.code==="V4_SHARP_COMPOSITION_FAILED");await textTask;assert.equal(preserved,true);assert.equal(textSaved,true);});';
patch('tests/v3-pipeline.test.js',oldSharpFailure,newSharpFailure,'Sharp failure contract');

patch('tests/v4-server-brand-authority.test.js',
'  assert.match(executor,/le rendu de contrôle reste composé par Sharp/);',
'  assert.match(executor,/V4_ANALYSIS_FAILED/);\n  assert.match(executor,/V4_SHARP_COMPOSITION_FAILED/);\n  assert.match(executor,/finalCompositionEngine:"sharp-server"/);',
'authority assertions');

console.log('V4 regression fixes applied');
