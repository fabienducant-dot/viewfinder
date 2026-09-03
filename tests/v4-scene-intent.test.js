"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {SERVICE_REGISTRY,getServiceContract}=require("../netlify/functions/_shared/v3-registry");
const {buildSceneIntent,resolveVisualMode,explicitDemonstrationRequested}=require("../netlify/functions/_shared/v3-scene-intent");
const {planV3}=require("../netlify/functions/_shared/v3-pipeline");
const {assessQuality}=require("../netlify/functions/_shared/v3-quality");

function brief(request="Douleurs dorsales, blocage, sensations de lourdeur",registers=["Fantastique","Cinématographie","Architecture"]){
  return {exactUserRequest:request,rawSubject:request,coreTheme:request,selectedRegisters:registers,physicalOrEmotionalManifestation:`Une posture exprime ${request}`,dramaticMoment:"L’instant précis où le poids cesse de dominer le corps et où l’espace s’ouvre.",transformationPromise:"La posture retrouve visuellement de l’amplitude et de l’espace, sans promesse médicale."};
}
function art(){return {artistic:{architectureDescription:"temple noir minéral ouvert sur un paysage féerique profond",locationFamily:"architecture minérale ouverte"}};}

test("les mots anatomiques seuls ne déclenchent plus une photo de soin",()=>{
  for(const request of ["Douleurs du dos et lourdeur","Pieds fatigués après une longue journée","Visage marqué par une semaine intense"]){
    assert.equal(explicitDemonstrationRequested(brief(request,[])),false,request);
    assert.equal(resolveVisualMode(getServiceContract("Massage dos/zone"),"Story",brief(request,[])),"narrative_consequence");
  }
});

test("une demande procédurale explicite conserve le mode démonstration",()=>{
  const b=brief("Montrer la technique et le geste de massage sur le dos",["Cinématographie"]);
  assert.equal(explicitDemonstrationRequested(b),true);
  assert.equal(resolveVisualMode(getServiceContract("Massage dos/zone"),"Story",b),"demonstration");
});

test("les massages ordinaires montrent la conséquence narrative, pas automatiquement le soin",()=>{
  const services=Object.keys(SERVICE_REGISTRY).filter(name=>/Massage|Réflexologie|Soin minceur/i.test(name)&&!/^Offre /.test(name));
  assert.ok(services.length>=10);
  for(const service of services){
    const intent=buildSceneIntent({contract:getServiceContract(service),subjectBrief:brief(),artDirection:art(),platform:"Story"});
    assert.equal(intent.mode,"narrative_consequence",service);
    assert.equal(intent.serviceRole,"invisible_cause",service);
    assert.match(intent.providerPrompt,/cause invisible de la transformation/i,service);
    assert.doesNotMatch(intent.providerPrompt,/praticien et bénéficiaire tous deux visibles|table de massage|geste précis sur la zone/i,service);
  }
});

test("PSiO, offres composites et Google gardent leurs besoins propres",()=>{
  assert.equal(buildSceneIntent({contract:getServiceContract("Luminothérapie PSIO®"),subjectBrief:brief("Retrouver du calme",[]),artDirection:art(),platform:"Story"}).mode,"product_fidelity");
  assert.equal(buildSceneIntent({contract:getServiceContract("Offre Gold"),subjectBrief:brief("Une parenthèse complète",[]),artDirection:art(),platform:"Story"}).mode,"composite_fidelity");
  assert.equal(buildSceneIntent({contract:getServiceContract("Massage Zébré"),subjectBrief:brief("Besoin de souffler",[]),artDirection:art(),platform:"Google Business"}).mode,"local_credibility");
});

test("Fantastique, Architecture et Cinématographie survivent pour une vraie prestation",()=>{
  const intent=buildSceneIntent({contract:getServiceContract("Massage dos/zone"),subjectBrief:brief(),artDirection:art(),platform:"Story"});
  assert.deepEqual(intent.registers,{cinematic:true,fantastic:true,architectural:true});
  assert.match(intent.providerPrompt,/temple noir minéral/i);
  assert.match(intent.providerPrompt,/fantastique adulte et crédible/i);
  assert.match(intent.providerPrompt,/photographie éditoriale de luxe/i);
});

test("la demande exacte apparaît une seule fois dans le prompt fournisseur",()=>{
  const request="Douleurs dorsales, blocage, sensations de lourdeur";
  const intent=buildSceneIntent({contract:getServiceContract("Massage dos/zone"),subjectBrief:brief(request),artDirection:art(),platform:"Story"});
  assert.equal(intent.providerPrompt.split(request).length-1,1);
  assert.match(intent.providerPrompt,/Moment dramatique/);
  assert.match(intent.providerPrompt,/premier plan sombre, un plan principal narratif et un arrière-plan profond/i);
});

test("planV3 expose désormais SceneIntent V4 comme unique prompt fournisseur",()=>{
  const request="Douleurs dorsales, blocage, sensations de lourdeur";
  const plan=planV3({service:"Massage dos/zone",platform:"Story",subject:request,selectedRegisters:["Fantastique","Cinématographie","Architecture"],textChoice:"automatic",creativeSeed:"v4-systemic-test",costMode:"test"});
  assert.equal(plan.version,4);
  assert.equal(plan.consistencyReport.authority,"SceneIntentV4");
  assert.equal(plan.photoBrief.prompt,plan.sceneIntent.providerPrompt);
  assert.equal(plan.sceneIntent.mode,"narrative_consequence");
  assert.equal(plan.consistencyReport.ready,true);
});

test("le contrôle qualité accepte une transformation sans praticien en mode narratif",()=>{
  const intent=buildSceneIntent({contract:getServiceContract("Massage dos/zone"),subjectBrief:brief(),artDirection:art(),platform:"Story"});
  const quality=assessQuality({contract:getServiceContract("Massage dos/zone"),sceneIntent:intent,analysis:{subjectMatchesRequest:true,dramaticMomentPresent:true,transformationReadable:true,cinematicPosterRead:true,threePlaneDepth:true,genericSpaRisk:.05,literalTreatmentSceneRisk:.05,observedRegisters:["cinematic","fantastic","architectural"],architectureObserved:true,fantasticObserved:true,brandSafeZoneAvailable:true,equipment:[],parasites:[],paletteDrift:.05},composition:{imageExists:true,contrastValid:true,gazeHierarchyValid:true,thumbnailImpact:true,logoIntegrity:true,logoAssetIntegrity:true,logoFringeDetected:false,logoScaleValid:true,marginsValid:true,textWithinCanvas:true,protectedCollision:false,logoRectangleOpaque:false}});
  assert.equal(quality.ok,true,JSON.stringify(quality));
  assert.equal(quality.business.errors.includes("nombre_identites"),false);
  assert.equal(quality.business.errors.includes("geste_obligatoire"),false);
});

test("une scène spa générique ou littérale est bloquée même si elle est techniquement propre",()=>{
  const intent=buildSceneIntent({contract:getServiceContract("Massage dos/zone"),subjectBrief:brief(),artDirection:art(),platform:"Story"});
  const base={subjectMatchesRequest:true,dramaticMomentPresent:true,transformationReadable:true,cinematicPosterRead:true,threePlaneDepth:true,observedRegisters:["cinematic","fantastic","architectural"],architectureObserved:true,fantasticObserved:true,brandSafeZoneAvailable:true,equipment:[],parasites:[],paletteDrift:.05};
  const composition={imageExists:true,contrastValid:true,gazeHierarchyValid:true,thumbnailImpact:true,logoIntegrity:true,logoAssetIntegrity:true,logoFringeDetected:false,logoScaleValid:true,marginsValid:true,textWithinCanvas:true,protectedCollision:false,logoRectangleOpaque:false};
  const generic=assessQuality({contract:getServiceContract("Massage dos/zone"),sceneIntent:intent,analysis:{...base,genericSpaRisk:.8,literalTreatmentSceneRisk:.1},composition});
  assert.equal(generic.ok,false);assert.ok(generic.artistic.errors.includes("risque_spa_generique"));
  const literal=assessQuality({contract:getServiceContract("Massage dos/zone"),sceneIntent:intent,analysis:{...base,genericSpaRisk:.1,literalTreatmentSceneRisk:.9},composition});
  assert.equal(literal.ok,false);assert.ok(literal.artistic.errors.includes("illustration_litterale_du_soin"));
});
