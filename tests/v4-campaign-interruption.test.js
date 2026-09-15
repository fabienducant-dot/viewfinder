"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const html=fs.readFileSync(process.env.VF_AUDIT_INDEX||"index.html","utf8");
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return html.slice(a,b);}
function generationContext(item,confirm,save=()=>true){let ids=0;const ctx=vm.createContext({Date,uid:()=>`request-${++ids}`,state:{scheduled:[item]},LS:{set:save},API_IMAGE_SIZE_BY_PLATFORM:{},PLATFORM_ASPECT:{},resolveReferenceSelectionsByIds:async()=>[],confirmAndGenerateImage:confirm});vm.runInContext(section("async function generateImageForCampaignItem(","/* Génération de texte pour un post de campagne"),ctx);return ctx;}
test("une normalisation pendant un travail conserve l'objet vivant et la preuve Sharp",()=>{
 const item={id:"post",pendingImageJobId:"paid",finalCompositionEngine:"sharp-server"};
 const ctx=vm.createContext({state:{scheduled:[item]},uid:()=>"fixture",DEFAULT_STYLES:[],KNOWN_REGISTRES:[],SERVICE_MENU:{options:[],ALL_SUBJECTS:"Tous"},normalizeModule:x=>x,normalizeStyle:x=>x,normalizeImage:x=>x,normalizeDirectionArtistique:x=>x,normalizeCampaignHistoryEntry:x=>x});
 vm.runInContext(section("function normalizeScheduledPost(","function normalizeDirectionArtistique("),ctx);
 vm.runInContext(section("function normalizeState(){","normalizeState();"),ctx);
 ctx.normalizeState();assert.equal(ctx.state.scheduled[0],item);
 item.imageDataUrl="data:completed";assert.equal(ctx.state.scheduled[0].imageDataUrl,"data:completed");
 assert.equal(ctx.normalizeScheduledPost(item).finalCompositionEngine,"sharp-server");
});
test("une réponse de création perdue conserve le même identifiant après rechargement",async()=>{
 const item={id:"post",platform:"Story"},requests=[];let saved;
 const confirm=async p=>{requests.push(p.clientRequestId);throw Error("réponse perdue avant jobId");};
 const ctx=generationContext(item,confirm,(_,value)=>{saved=JSON.stringify(value);return true;});
 await assert.rejects(ctx.generateImageForCampaignItem(item),/réponse perdue/);
 const restored=JSON.parse(saved)[0],reload=generationContext(restored,confirm);
 await assert.rejects(reload.generateImageForCampaignItem(restored),/réponse perdue/);
 assert.ok(requests[0]);assert.equal(requests[0],requests[1]);
});
test("une reprise automatique et un clic simultané partagent un seul appel",async()=>{
 let calls=0,release;const item={id:"post",platform:"Story"};
 const ctx=generationContext(item,async()=>{calls++;await new Promise(r=>{release=r;});return {ok:false,error:"fixture"};});
 const a=ctx.generateImageForCampaignItem(item),b=ctx.generateImageForCampaignItem(item);
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);release();
 const results=await Promise.allSettled([a,b]);assert.ok(results.every(x=>x.status==="rejected"));
});
test("un stockage plein bloque avant toute création payante",async()=>{
 let calls=0;const item={id:"post",platform:"Story"};const ctx=generationContext(item,async()=>{calls++;},()=>false);
 await assert.rejects(ctx.generateImageForCampaignItem(item),/Stockage indisponible/);assert.equal(calls,0);
});
test("le plafond campagne exige un accord explicite et transmet cet accord",async()=>{
 let calls=0;const item={id:"post",platform:"Story",v3Plan:{preflightCostAudit:{estimatedTotalMin:.19,estimatedTotalMax:.495,effectiveMode:"test",effectiveQuality:"low"}}};
 const ctx=generationContext(item,async p=>{calls++;assert.equal(p.costCeilingConfirmed,true);return {ok:false,error:"fixture"};});
 ctx.confirm=()=>false;await assert.rejects(ctx.generateImageForCampaignItem(item),/annulée/);assert.equal(calls,0);
 ctx.confirm=()=>true;await assert.rejects(ctx.generateImageForCampaignItem(item),/fixture/);assert.equal(calls,1);
});
test("le maître existant ou en attente précède le format Instagram",()=>{
 const ctx=vm.createContext({});vm.runInContext(section("function selectCampaignMaster(","async function recomposeCampaignItemFromMaster("),ctx);
 const fresh={platform:"Instagram"},pending={platform:"Story",pendingImageJobId:"paid"},uncertain={clientRequestId:"sent"},existing={masterRawImageJobId:"raw",v3Finalization:{analysis:{}}};
 assert.equal(ctx.selectCampaignMaster([fresh,pending]),pending);assert.equal(ctx.selectCampaignMaster([fresh,uncertain]),uncertain);assert.equal(ctx.selectCampaignMaster([fresh,pending,existing]),existing);
});
test("reprendre un job PSiO ne dépend plus des références locales ni d'une resynchronisation du logo",async()=>{
 let called=false;
 const ctx=vm.createContext({state:{costMode:"production"},OFFICIAL_PSIO_REFERENCE_IDS:new Set(),OFFICIAL_PSIO_REFERENCES:[1,2,3],OFFICIAL_HEALY_REFERENCE_IDS:new Set(),OFFICIAL_HEALY_REFERENCES:[1],logoRequiredFor:()=>true,PLATFORM_OVERLAY:{},rememberV4ArtAttempt:()=>{},v4ArtHistory:()=>[],uid:()=>"id",getOfficialLogoAsset:()=>{throw Error("ne doit pas être appelé");},
 callProviderImage:async(prompt,size,ref,status,cancel,options)=>{called=true;assert.equal(options.resumeJobId,"paid");assert.equal(options.costMode,"test");throw Error("poll fixture");}});
 vm.runInContext(section("async function confirmAndGenerateImage(","/* T2 : runLegacyImageGeneration"),ctx);
 const result=await ctx.confirmAndGenerateImage({inputs:{prestation:"Luminothérapie PSIO®",platform:"Story"},brief:{},v3Plan:{costMode:"test",artDirection:{}},resumeJobId:"paid",referenceSelections:[]});
 assert.equal(called,true);assert.match(result.error,/poll fixture/);
});
