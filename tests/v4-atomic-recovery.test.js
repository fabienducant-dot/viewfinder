"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const {createRequire}=require("node:module");
const {reserveOnce}=require("../netlify/functions/_shared/v4-job-claims");
const {prepareAnalysisRecovery,runAnalysisRecovery}=require("../netlify/functions/_shared/v4-analysis-recovery");
function memoryStore(){const records=new Map();return {records,get:async k=>records.get(k)||null,set:async(k,v,o)=>{if(o?.onlyIfNew&&records.has(k))return {modified:false};records.set(k,v);return {modified:true,etag:"fixture"};},delete:async k=>records.delete(k)};}
test("vingt réservations concurrentes n'élisent qu'un propriétaire",async()=>{
 const store=memoryStore();const results=await Promise.all(Array.from({length:20},(_,i)=>reserveOnce(store,"same",{jobId:`job-${i}`})));
 assert.equal(results.filter(r=>r.created).length,1);assert.equal(new Set(results.map(r=>r.record.jobId)).size,1);
});
test("une réponse SDK ambiguë ou une ancienne version bloque sans autoriser l'appel payant",async()=>{
 await assert.rejects(reserveOnce({set:async()=>undefined},"key",{jobId:"job"}),/atomique/);
 await assert.rejects(reserveOnce({set:async()=>({modified:true}),get:async()=>JSON.stringify({jobId:"job",owner:"someone-else"})},"key",{jobId:"job"}),/incohérente/);
});
test("le vrai SDK envoie la précondition HTTP et reconnaît le refus 412",async()=>{
 const {getStore}=require("@netlify/blobs");let writes=0;
 const store=getStore({name:"fixture",siteID:"fixture",token:"fixture",edgeURL:"https://fixture.invalid",fetch:async(url,options)=>{
  if(options.method==="put"){assert.equal(options.headers["if-none-match"],"*");writes++;return new Response(null,{status:412});}
  throw Error(`Appel imprévu ${url}`);
 }});
 const result=await store.set("key","value",{onlyIfNew:true});assert.equal(result.modified,false);assert.equal(writes,1);
});
test("create-image-job déclenche un seul worker pour vingt requêtes identiques",async()=>{
 const store=memoryStore(),filename=path.resolve("netlify/functions/create-image-job.js"),realRequire=createRequire(filename);let triggers=0;
 const exports={},ctx=vm.createContext({exports,process:{env:{IMAGE_JOB_SECRET:"fixture"}},console,fetch:async()=>{triggers++;return {status:202};},require:name=>name==="@netlify/blobs"?{getStore:()=>store}:name.endsWith("netlify-invocation-url")?{resolveInvocationBaseUrl:()=>"https://fixture.invalid"}:realRequire(name)});
 vm.runInContext(fs.readFileSync(filename,"utf8"),ctx);
 const event={httpMethod:"POST",body:JSON.stringify({prompt:"fixture",clientRequestId:"same",costMode:"test",quality:"low"})};
 const responses=await Promise.all(Array.from({length:20},()=>exports.handler(event)));const bodies=responses.map(r=>JSON.parse(r.body));
 assert.ok(responses.every(r=>r.statusCode===200),JSON.stringify(bodies));assert.equal(triggers,1);assert.equal(new Set(bodies.map(b=>b.jobId)).size,1);
});
test("la reprise d'analyse exige une confirmation et facture zéro nouvelle photo",async()=>{
 const store=memoryStore(),plan={version:4};await store.set("jobs/source",JSON.stringify({jobId:"source",status:"failed",rawResultKey:"raw",v3Plan:plan}));
 await assert.rejects(prepareAnalysisRecovery(store,{recoverAnalysisFor:"source",clientRequestId:"retry"}),/Confirmation/);
 const input=await prepareAnalysisRecovery(store,{recoverAnalysisFor:"source",clientRequestId:"retry",analysisConfirmed:true});assert.equal(input.analysisOnly,true);assert.equal(input.costAudit.image.calls,0);assert.equal(input.costAudit.vision.calls,1);
 assert.ok(input.costAudit.estimatedTotalMax>0);
});
test("vingt invocations du worker ne répètent pas la génération, même après un suivi ancien",async()=>{
 const store=memoryStore(),filename=path.resolve("netlify/functions/process-image-job-background.js"),realRequire=createRequire(filename);let images=0;
 await store.set("jobs/one",JSON.stringify({jobId:"one",status:"queued"}));await store.set("jobs/one/input",JSON.stringify({prompt:"fixture",costMode:"test",quality:"low"}));
 const exports={},ctx=vm.createContext({exports,Buffer,Date,console:{error:()=>{}},process:{env:{IMAGE_JOB_SECRET:"fixture",OPENAI_API_KEY:"fixture"}},
 fetch:async()=>{images++;return {ok:false,status:503,text:async()=>"fixture failure"};},require:name=>name==="@netlify/blobs"?{getStore:()=>store}:realRequire(name)});
 vm.runInContext(fs.readFileSync(filename,"utf8"),ctx);const event={headers:{"x-image-job-secret":"fixture"},body:JSON.stringify({jobId:"one"})};
 await Promise.all(Array.from({length:20},()=>exports.handler(event)));assert.equal(images,1);
 await store.set("jobs/one",JSON.stringify({jobId:"one",status:"processing",updatedAt:1}));await exports.handler(event);assert.equal(images,1);
});
test("la reprise analyse le brut conservé et compose sans fonction de génération Images",async()=>{
 const {planV3}=require("../netlify/functions/_shared/v3-pipeline");const plan=planV3({service:"Massage dos/zone",subject:"lourdeur du dos",platform:"Story"});
 const store=memoryStore();const raw=Buffer.from("existing-photo");await store.set("raw",JSON.stringify({b64:raw.toString("base64")}));await store.set("jobs/source",JSON.stringify({jobId:"source",status:"failed",rawResultKey:"raw",v3Plan:plan}));await store.set("jobs/retry",JSON.stringify({jobId:"retry",status:"processing"}));
 const input=await prepareAnalysisRecovery(store,{recoverAnalysisFor:"source",clientRequestId:"confirmed",analysisConfirmed:true});let visions=0,compositions=0;
 await runAnalysisRecovery({store,jobId:"retry",input,key:"fixture",analyzeImage:async args=>{assert.ok(args.imageBuffer.equals(raw));visions++;return {availableContrast:.8,density:.2,calmZones:["bottom"]};},composeImage:async args=>{assert.ok(args.imageBuffer.equals(raw));compositions++;const output=Buffer.from("composed");output.compositionManifest={finalCompositionEngine:"sharp-server"};return output;}});
 const result=JSON.parse(await store.get("jobs/retry"));assert.equal(result.status,"completed");assert.equal(result.imageGenerationCallCount,0);assert.equal(visions,1);assert.equal(compositions,1);assert.ok(JSON.parse(await store.get("jobs/source")).v3Finalization.analysis);
});
test("le navigateur demande l'accord d'analyse puis reprend le même job après une coupure",async()=>{
 const saved=new Map(),calls=[];let approval=false,confirmations=0,interrupted=true;
 const plan={artDirection:{platform:"Story"},contract:{name:"Massage dos/zone"},posterStrategy:{},legacyProjection:{}};
 const ctx=vm.createContext({LS:{get:k=>saved.get(k),set:(k,v)=>{saved.set(k,v);return true;}},uid:()=>"same-request",confirm:()=>{confirmations++;return approval;},
 fetch:async(url,options)=>{calls.push(url);if(url.includes("source"))return {ok:true,data:{analysisRequired:true,analysisRecoveryEstimate:{estimatedTotalMax:.01}}};if(url.includes("create-image-job")){assert.equal(JSON.parse(options.body).analysisConfirmed,true);return {ok:true,data:{jobId:"retry"}};}if(url.includes("get-image-job"))return {ok:true,data:interrupted?{status:"processing"}:{status:"completed",result:{v3Plan:plan,v3Finalization:{analysis:{}}}}};return {ok:true,data:{jobId:"derived",resultUrl:"fixture",finalCompositionEngine:"sharp-server",quality:{ok:true},compositionManifest:{finalCompositionEngine:"sharp-server"}}};},
 fetchJsonOrThrowRaw:async r=>r.data,pollImageJob:async id=>{assert.equal(id,"retry");if(interrupted)throw Error("network");return {};},fetchImageAsDataUrl:async()=>"data:final",analysisFromServer:()=>({altText:"fixture"}),rememberRecoverableImageJob:()=>{}});
 const html=fs.readFileSync("index.html","utf8"),a=html.indexOf("async function recoverAndRecomposeImageJob("),b=html.indexOf("async function confirmAndGenerateImage(",a);vm.runInContext(html.slice(a,b),ctx);
 const record={jobId:"source",serverDiscovered:true};await assert.rejects(ctx.recoverAndRecomposeImageJob(record),/annulée/);assert.equal(calls.filter(x=>x.includes("create-image-job")).length,0);
 approval=true;await assert.rejects(ctx.recoverAndRecomposeImageJob(record),/network/);interrupted=false;
 const flow=await ctx.recoverAndRecomposeImageJob(record);assert.equal(flow.ok,true);assert.equal(confirmations,2);assert.equal(calls.filter(x=>x.includes("create-image-job")).length,1);
});
test("si la composition échoue après la reprise, l'analyse réussie reste disponible gratuitement",async()=>{
 const plan=require("../netlify/functions/_shared/v3-pipeline").planV3({service:"Massage dos/zone",subject:"lourdeur du dos",platform:"Story"});const store=memoryStore();
 await store.set("raw",JSON.stringify({b64:Buffer.from("photo").toString("base64")}));await store.set("jobs/source",JSON.stringify({jobId:"source",status:"failed",rawResultKey:"raw",v3Plan:plan}));
 const input=await prepareAnalysisRecovery(store,{recoverAnalysisFor:"source",clientRequestId:"retry",analysisConfirmed:true});
 await assert.rejects(runAnalysisRecovery({store,jobId:"retry",input,key:"fixture",analyzeImage:async()=>({availableContrast:.42,density:.3}),composeImage:async()=>{throw Error("fixture Sharp failure");}}),/Sharp/);
 const source=JSON.parse(await store.get("jobs/source"));assert.equal(source.v3Finalization.analysis.availableContrast,.42);
 assert.equal(require("../netlify/functions/recompose-image-job").isRecoverableOriginal(source),true);
});
