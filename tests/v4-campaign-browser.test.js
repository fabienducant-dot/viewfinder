"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {planV3}=require("../netlify/functions/_shared/v3-pipeline");
const html=fs.readFileSync("index.html","utf8");
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return html.slice(a,b);}
test("le parcours navigateur prépare les sept formats avec une graine commune et des textes conservés",async()=>{
 let id=0;const requests=[];
 const ctx=vm.createContext({console,Date,uid:()=>`test-${++id}`,VF_VERSION:"test",
  state:{prestationName:"Massage dos/zone",registres:["fantastique","architecture","cinematographie"],textOnImageChoice:"automatic",costMode:"test"},
  PLATFORM_ASPECT:{},API_IMAGE_SIZE_BY_PLATFORM:{},v4ArtHistory:()=>[],
  fetch:async(url,options)=>{assert.equal(url,"/.netlify/functions/plan-v3");const input=JSON.parse(options.body);requests.push(input);return {ok:true,plan:planV3(input)};},
  fetchJsonOrThrowRaw:async r=>r.plan,computeAllowedArchetypes:()=>[],computeRecentCompositionExclusions:()=>[],
  selectReferencesForBrief:()=>[],getOfficialLogoAsset:async()=>({dataUrl:"fixture-logo"}),
  generateContentFromBrief:async(brief,analysis,platform)=>({caption:`Texte ${platform}`,hashtags:[]}),
  buildTextPromptFull:platform=>`Prompt ${platform}`});
 vm.runInContext(section("const CAMPAIGN_ITEMS = [","/* ============================================================"),ctx);
 vm.runInContext(section("function applyAuthoritativeV3Plan(","/* Chemin produit unique"),ctx);
 vm.runInContext(section("async function prepareAuthoritativeV3(","/* ============================================================\n   AUDIT IA"),ctx);
 const posts=await ctx.generateCampaignPosts("Douleurs dorsales, blocage, sensations de lourdeur","Faire réserver");
 assert.equal(posts.length,7);assert.equal(requests.length,7);
 assert.equal(new Set(requests.map(r=>r.creativeSeed)).size,1);
 assert.equal(new Set(posts.map(p=>p.v3Plan.artSelection.sceneKey)).size,1);
 for(const p of posts){assert.equal(p.blockingError,null);assert.ok(p.contentData.caption);assert.equal(p.imageDataUrl,null);assert.equal(p.imagePrompt,p.v3Plan.sceneIntent.providerPrompt);}
 assert.equal(posts.find(p=>p.platform==="Google Business").v3Plan.posterStrategy.title,"");
});
test("un suivi interrompu conserve le job payant et réutilise son ID au prochain essai",async()=>{
 const seen=[];const item={platform:"Instagram",mission:"Faire réserver",topic:"dos",referenceSelectionIds:[],v3Plan:{contract:{name:"Massage dos/zone"}}};
 item.contentData={caption:"Texte déjà préparé"};
 const ctx=vm.createContext({Date,state:{scheduled:[item],prestationName:"Reiki"},API_IMAGE_SIZE_BY_PLATFORM:{},PLATFORM_ASPECT:{},
  LS:{set:()=>true},resolveReferenceSelectionsByIds:async()=>[],
  confirmAndGenerateImage:async prepared=>{seen.push(prepared);prepared.onImageJobCreated("paid-job");return {ok:false,error:"interruption réseau"};}});
 vm.runInContext(section("async function generateImageForCampaignItem(","/* Génération de texte pour un post de campagne"),ctx);
 await assert.rejects(ctx.generateImageForCampaignItem(item,()=>{},{cancelled:false}),/interruption réseau/);
 assert.equal(item.pendingImageJobId,"paid-job");
 await assert.rejects(ctx.generateImageForCampaignItem(item,()=>{},{cancelled:false}),/interruption réseau/);
 assert.equal(seen[1].resumeJobId,"paid-job");
 assert.equal(seen[1].inputs.prestation,"Massage dos/zone");
 assert.equal(seen[1].content,item.contentData);
});
test("la recomposition navigateur conserve le plan cible et sa preuve Sharp",async()=>{
 const target={artDirection:{platform:"Google Business"},posterStrategy:{title:"",subtitle:""}},item={platform:"Google Business",v3Plan:target},master={masterRawImageJobId:"paid-master",v3Plan:{artDirection:{platform:"Instagram"}},v3Finalization:{analysis:{}}};
 let request;
 const ctx=vm.createContext({PLATFORM_OVERLAY:{"Google Business":"aucun"},state:{scheduled:[item]},LS:{set:()=>true},
  fetch:async(url,options)=>{request=JSON.parse(options.body);return {ok:true};},
  fetchJsonOrThrowRaw:async()=>({resultUrl:"fixture",jobId:"derived",v3Plan:target,quality:{ok:true},finalCompositionEngine:"sharp-server",compositionManifest:{title:"",finalCompositionEngine:"sharp-server"}}),
  fetchImageAsDataUrl:async()=>"data:image/png;base64,fixture"});
 vm.runInContext(section("async function recomposeCampaignItemFromMaster(","/* Génération d'image pour un post de campagne"),ctx);
 await ctx.recomposeCampaignItemFromMaster(item,master);
 assert.equal(request.targetPlan.artDirection.platform,"Google Business");assert.equal(item.v3Plan,target);
 assert.equal(item.finalCompositionEngine,"sharp-server");assert.equal(item.headlineApplied,false);
 assert.equal(item.masterRawImageJobId,"paid-master");
});
