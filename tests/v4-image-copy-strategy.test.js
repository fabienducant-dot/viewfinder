"use strict";
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
