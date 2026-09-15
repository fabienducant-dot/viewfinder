"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),sharp=require("sharp");
const {planV3,validatePreparedPlan}=require("../netlify/functions/_shared/v3-pipeline");
const {targetCampaignPlan}=require("../netlify/functions/_shared/v4-campaign-plan");
const {PLATFORM_TEMPLATES}=require("../netlify/functions/_shared/v3-layout-engine");
const {composeBrandPoster}=require("../netlify/functions/_shared/brand-compositor");
const input={service:"Massage dos/zone",subject:"Douleurs dorsales, blocage, sensations de lourdeur",selectedRegisters:["cinematographie","architecture","fantastique"],creativeSeed:"campaign-regression",textChoice:"automatic"};

test("toutes les projections narratives partagent le même moment sans imposer un praticien",()=>{
 const p=planV3({...input,platform:"Story"});
 assert.equal(validatePreparedPlan(p),p);
 assert.equal(p.subjectBrief.dramaticMoment,p.sceneIntent.transformation.moment);
 assert.equal(p.posterStrategy.careOrSolutionManifestation,p.sceneIntent.transformation.moment);
 assert.equal(p.legacyProjection.action,p.sceneIntent.transformation.moment);
 assert.equal(p.preflight.subjectBrief.dramaticMoment,p.sceneIntent.transformation.moment);
 assert.equal(p.posterStrategy.secondarySubject,null);
 assert.equal(p.subjectBrief.visualSecondarySubject,null);
 assert.doesNotMatch(JSON.stringify(p.legacyProjection),/geste précis sur la zone|praticien et bénéficiaire/);
 assert.equal(p.freeScores.heuristic,true);
});
test("la démonstration et le produit gardent leur preuve métier",()=>{
 const p=planV3({...input,platform:"Story",subject:"Montrer le geste de massage sur le dos"});
 assert.equal(p.sceneIntent.mode,"demonstration");assert.ok(p.posterStrategy.secondarySubject);
 const psio=planV3({...input,service:"Luminothérapie PSIO®",platform:"Story"});
 assert.equal(psio.sceneIntent.mode,"product_fidelity");assert.equal(psio.psioRequired,true);
});
test("sept recompositions Sharp conservent les plans cibles et Google sans titre",async()=>{
 const source=planV3({...input,platform:"Instagram"});
 const raw=await sharp({create:{width:1088,height:1360,channels:3,background:"#202020"}}).png().toBuffer();
 for(const platform of Object.keys(PLATFORM_TEMPLATES)){
  const target=planV3({...input,platform});
  assert.equal(target.artSelection.sceneKey,source.artSelection.sceneKey);
  const resolved=targetCampaignPlan(source,platform,target);
  assert.equal(resolved,target);
  const output=await composeBrandPoster({imageBuffer:raw,platform,posterStrategy:resolved.posterStrategy});
  const m=output.compositionManifest;
  assert.equal(m.platform,platform);assert.equal(m.textWithinCanvas,true);assert.equal(m.logoWithinCanvas,true);
  assert.equal(m.finalCompositionEngine,"sharp-server");
  if(platform==="Google Business"){assert.equal(m.title,"");assert.equal(m.subtitle,"");}
  else assert.ok(m.title);
 }
 const oldGoogle=targetCampaignPlan(source,"Google Business");
 assert.equal(oldGoogle.posterStrategy.textMode,"TEXT_MODE_NONE");
 assert.throws(()=>targetCampaignPlan(source,"Google Business",source),/plan cible/);
});
