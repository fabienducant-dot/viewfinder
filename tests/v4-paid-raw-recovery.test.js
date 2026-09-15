"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {isRecoverableOriginal,findLatestRecoverableJob}=require("../netlify/functions/recompose-image-job");
test("une panne de composition conserve la photo payée, le plan et l'analyse pour récupération gratuite",async()=>{
 const plan={version:4},analysis={availableContrast:.7};let imageCalls=0;
 const records=new Map([["jobs/paid",JSON.stringify({jobId:"paid",status:"queued",createdAt:1})],["jobs/paid/input",JSON.stringify({prompt:"fixture",quality:"low",costMode:"test",v3Plan:plan,brandComposition:{enabled:true}})]]);
 const store={get:async k=>records.get(k)||null,set:async(k,v)=>records.set(k,v),list:async()=>({blobs:[{key:"jobs/paid"}]})};
 const exports={};const ctx=vm.createContext({exports,Buffer,Date,console:{error:()=>{}},process:{env:{IMAGE_JOB_SECRET:"fixture",OPENAI_API_KEY:"fixture"}},
  fetch:async()=>{imageCalls++;return {ok:true,json:async()=>({data:[{b64_json:Buffer.from("fixture-image").toString("base64")} ]})};},
  require:name=>{if(name==="@netlify/blobs")return {getStore:()=>store};if(name.endsWith("v3-executor"))return {executeV3Pipeline:async()=>{const e=Error("Composition Sharp V4 impossible : fixture");e.code="V4_SHARP_COMPOSITION_FAILED";e.finalization={analysis};throw e;}};return {};}});
 vm.runInContext(fs.readFileSync("netlify/functions/process-image-job-background.js","utf8"),ctx);
 await exports.handler({headers:{"x-image-job-secret":"fixture"},body:JSON.stringify({jobId:"paid"})});
 const job=JSON.parse(records.get("jobs/paid"));assert.equal(imageCalls,1);assert.equal(job.status,"failed");assert.equal(job.imageGenerationCallCount,1);
 assert.ok(records.get(job.rawResultKey));assert.deepEqual(job.v3Plan,plan);assert.deepEqual(job.v3Finalization.analysis,analysis);
 assert.equal(isRecoverableOriginal(job),true);assert.equal((await findLatestRecoverableJob(store)).jobId,"paid");
 await exports.handler({headers:{"x-image-job-secret":"fixture"},body:JSON.stringify({jobId:"paid"})});assert.equal(imageCalls,1);
});
test("une analyse absente ne devient jamais une récupération artificiellement validée",()=>{
 assert.equal(isRecoverableOriginal({status:"failed",rawResultKey:"raw",v3Plan:{}}),false);
});
test("le bouton récupération traverse le statut échoué et appelle uniquement la recomposition gratuite",async()=>{
 const {createHandler}=require("../netlify/functions/get-image-job");
 const plan={artDirection:{platform:"Story"},contract:{name:"Massage dos/zone"},posterStrategy:{title:"DOS"},legacyProjection:{}};
 const job={jobId:"paid",status:"failed",error:{message:"panne Sharp"},rawResultKey:"raw",v3Plan:plan,v3Finalization:{analysis:{availableContrast:.7}}};
 const response=await createHandler(()=>({get:async()=>JSON.stringify(job)}))({httpMethod:"GET",queryStringParameters:{jobId:"paid"}});
 const status=JSON.parse(response.body);assert.equal(status.ok,false);assert.equal(status.recoverable,true);
 const calls=[];const ctx=vm.createContext({
  fetch:async(url)=>{calls.push(url);return {ok:true,data:calls.length===1?status:{jobId:"derived",resultUrl:"fixture",finalCompositionEngine:"sharp-server",compositionManifest:{finalCompositionEngine:"sharp-server"},quality:{ok:true}}};},
  fetchJsonOrThrowRaw:async r=>r.data,fetchImageAsDataUrl:async()=>"data:final",analysisFromServer:()=>({altText:"fixture"}),rememberRecoverableImageJob:()=>{},
  pollImageJob:()=>{throw Error("un job échoué ne doit pas être sondé à nouveau");}});
 const html=fs.readFileSync("index.html","utf8"),a=html.indexOf("async function recoverAndRecomposeImageJob("),b=html.indexOf("async function confirmAndGenerateImage(",a);
 vm.runInContext(html.slice(a,b),ctx);
 const flow=await ctx.recoverAndRecomposeImageJob({jobId:"paid",serverDiscovered:true});
 assert.equal(flow.ok,true);assert.equal(flow.finalCompositionEngine,"sharp-server");
 assert.deepEqual(calls,["/.netlify/functions/get-image-job?jobId=paid","/.netlify/functions/recompose-image-job"]);
});
