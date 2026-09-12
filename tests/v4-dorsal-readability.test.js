"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {buildSceneIntent,auditSceneIntent}=require("../netlify/functions/_shared/v3-scene-intent");
const {analyzeImageWithOpenAI}=require("../netlify/functions/_shared/v3-image-analyzer");

const contract={name:"Massage dos/zone",type:"massage",requiredAction:"geste précis sur la zone",recognition:"dos",requiredCompositeStages:[]};
function scene(extra={}){return buildSceneIntent({contract,platform:"Story",subjectBrief:{exactUserRequest:"Douleurs dorsales, blocage, sensations de lourdeur",selectedRegisters:["fantastique","architecture","cinematographie"],dramaticMoment:"poids et tension visibles autour de dos, puis les masses s’allègent",transformationPromise:"poids et tension visibles autour de dos, puis les masses s’allègent",...extra},artDirection:{artistic:{locationFamily:"clairière nocturne noire",architectureDescription:"clairière profonde bordée de troncs presque noirs"}}});}
test("le Golden dorsal distingue le moment de l'évolution et impose une posture lisible",()=>{
 const intent=scene();
 assert.notEqual(intent.transformation.moment,intent.transformation.after);
 assert.match(intent.providerPrompt,/dos et les épaules, posture en transition/);
 assert.match(intent.providerPrompt,/jamais sous-exposé/);
 assert.match(intent.providerPrompt,/sans dominante bleue/);
 assert.equal(auditSceneIntent(intent).ok,true,JSON.stringify(auditSceneIntent(intent)));
});
test("une demande sans personne ne reçoit pas d'instruction de posture humaine",()=>{
 const intent=scene({forbidsPeople:true});
 assert.match(intent.providerPrompt,/Aucune personne dans la scène/);
 assert.doesNotMatch(intent.providerPrompt,/Lisibilité dorsale :/);
});
test("une démonstration explicite conserve ses instructions métier",()=>{
 const intent=scene({exactUserRequest:"Montrer le geste de massage sur le dos"});
 assert.equal(intent.mode,"demonstration");
 assert.doesNotMatch(intent.providerPrompt,/Lisibilité dorsale :/);
});
test("l'analyse distingue vue de dos et transformation sans aucun appel réseau réel",async()=>{
 let body;
 await analyzeImageWithOpenAI({key:"test-only",imageBuffer:Buffer.from("fixture"),plan:{contract,sceneIntent:scene()},fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:"{}"}}]})};}});
 const instructions=body.messages[0].content;
 assert.match(instructions,/une personne simplement vue de dos ne prouve ni douleur/);
 assert.match(instructions,/lisibilité du sujet principal sur téléphone/);
 assert.match(instructions,/inférieure à 0.25/);
});
