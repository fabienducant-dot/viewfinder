"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
const {JSDOM,ResourceLoader,VirtualConsole}=require("jsdom");
class LocalResources extends ResourceLoader{
  fetch(url,options){if(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com/.test(url))return Promise.resolve(Buffer.from(""));if(url.startsWith("http://viewfinder.test/")){const relative=new URL(url).pathname.replace(/^\//,"");return Promise.resolve(fs.readFileSync(path.join(__dirname,"..",relative)));}return super.fetch(url,options);}
}
function waitFor(window,predicate,timeout=5000){return new Promise((resolve,reject)=>{const started=Date.now(),poll=()=>{try{if(predicate())return resolve();if(Date.now()-started>timeout)return reject(new Error("Timeout du smoke test DOM"));setTimeout(poll,20);}catch(error){reject(error);}};poll();});}
test("index.html démarre réellement sur viewport Android et construit toute l'interface",async()=>{
  const runtimeErrors=[],virtualConsole=new VirtualConsole();
  virtualConsole.on("jsdomError",error=>runtimeErrors.push(error));
  const dom=await JSDOM.fromFile(path.join(__dirname,"../index.html"),{
    url:"http://viewfinder.test/index.html",runScripts:"dangerously",resources:new LocalResources(),pretendToBeVisual:true,virtualConsole,
    beforeParse(window){Object.defineProperty(window,"innerWidth",{value:390});Object.defineProperty(window,"innerHeight",{value:844});window.matchMedia=()=>({matches:true,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});window.fetch=async()=>({ok:false,status:404,json:async()=>({}),text:async()=>"",blob:async()=>new window.Blob()});window.alert=()=>{};window.confirm=()=>false;window.scrollTo=()=>{};window.addEventListener("error",event=>runtimeErrors.push(event.error||new Error(event.message)));window.addEventListener("unhandledrejection",event=>runtimeErrors.push(event.reason));}
  });
  try{
    await waitFor(dom.window,()=>dom.window.document.querySelectorAll("#nav button").length>=4);
    const document=dom.window.document,nav=document.querySelector("#nav").textContent,main=document.querySelector("#main").textContent;
    for(const label of ["Accueil","Bibliothèque","Éditeur","Connaissances"])assert.match(nav,new RegExp(label));
    for(const action of ["Créer une image","Créer un post","Créer une campagne complète"])assert.match(main,new RegExp(action));
    assert.ok(main.trim().length>100,"l'accueil ne doit pas être vide");
    assert.equal(document.querySelector('[role="alert"]'),null);
    const createPost=[...document.querySelectorAll("button")].find(button=>button.textContent.includes("Créer un post"));assert.ok(createPost);createPost.click();
    await waitFor(dom.window,()=>[...document.querySelectorAll("select")].some(select=>[...select.options].some(option=>option.value==="Tous sujets")));
    const serviceSelect=[...document.querySelectorAll("select")].find(select=>[...select.options].some(option=>option.value==="Tous sujets"));
    assert.ok(serviceSelect);assert.equal(serviceSelect.options.length,19);assert.equal(new Set([...serviceSelect.options].map(option=>option.value)).size,19);
    assert.equal(runtimeErrors.length,0,runtimeErrors.map(error=>error&&error.stack||error).join("\n"));
  }finally{dom.window.close();}
});
test("une dépendance menu absente affiche une erreur d'initialisation visible",async()=>{
  class MissingMenu extends LocalResources{fetch(url,options){if(url.endsWith("/v3-service-menu.js"))return null;return super.fetch(url,options);}}
  const dom=await JSDOM.fromFile(path.join(__dirname,"../index.html"),{url:"http://viewfinder.test/index.html",runScripts:"dangerously",resources:new MissingMenu(),pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  try{await waitFor(dom.window,()=>/Erreur d’initialisation de Viewfinder/.test(dom.window.document.querySelector("#main").textContent));assert.match(dom.window.document.querySelector("#main").textContent,/Source canonique du menu indisponible/);}finally{dom.window.close();}
});
