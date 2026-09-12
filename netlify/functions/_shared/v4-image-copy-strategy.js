"use strict";

const VERSION="4.0.0-emotional-image-copy";
function clean(value){return String(value||"").replace(/\s+/g," ").trim();}
function normalize(value){return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function upper(value){return clean(value).toLocaleUpperCase("fr-FR");}
function safe(value){return clean(value).replace(/\b(guéri(?:son|r)?|diagnosti(?:c|quer)|thérapeutique|médical(?:e)?|garanti(?:e|s)?)\b/gi,"").replace(/\s+/g," ").trim();}
function defaultHeadline(subjectBrief,contract){
 const existing=safe(subjectBrief.editorialTitle||"");
 if(subjectBrief.editorialKind==="institutional"&&existing&&existing.length<=42)return upper(existing);
 const raw=normalize(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||"");
 if(/dos|dorsal|lombaire|blocage|lourdeur/.test(raw))return "LIBÉREZ CE QUE VOTRE DOS RETIENT";
 if(/cervical|nuque|occiput|migraine/.test(raw))return "RELÂCHEZ CE QUI PÈSE";
 if(/stress|mental|souffler|saturation|tension|lâcher|lacher/.test(raw))return "RETROUVEZ DE L’ESPACE";
 if(/fatigue|épuis|epuis|élan|elan|énergie|energie|vitalité|vitalite/.test(raw))return "RETROUVEZ VOTRE ÉLAN";
 if(/minceur|rafferm|légèreté|legerete/.test(raw))return "VERS PLUS DE LÉGÈRETÉ";
 if(/cadeau|offrir|bon cadeau/.test(raw))return "OFFREZ PLUS QU’UN MOMENT";
 if(/animal|chien|chat|ferme|cheval/.test(raw))return "UN MOMENT DE CALME POUR LUI AUSSI";
 if(existing&&existing.length<=42&&!/douleur|blocage|sensation|lourdeur/i.test(existing))return upper(existing);
 const service=safe(contract?.name||"");
 if(service&&service.length<=32)return upper(service);
 return "PRENEZ LE TEMPS DE VOUS RETROUVER";
}
function buildImageCopyStrategy({subjectBrief={},contract={},platform="Instagram",textChoice="automatic"}={}){
 const google=platform==="Google Business",none=textChoice==="none"||textChoice==="aucun";
 if(google||none)return Object.freeze({version:VERSION,headline:"",subheadline:"",rewritten:false,reason:google?"google-no-overlay":"text-disabled"});
 const raw=clean(subjectBrief.exactUserRequest||subjectBrief.rawSubject||subjectBrief.coreTheme||"");
 const headline=defaultHeadline(subjectBrief,contract);
 let subheadline="";
 const editorialSub=safe(subjectBrief.editorialSubtitle||"");
 if(subjectBrief.editorialKind==="institutional"&&editorialSub&&editorialSub.length<=48)subheadline=upper(editorialSub);
 else if(contract&&!contract.generic&&contract.name){const service=upper(contract.name);if(service!==headline&&service.length<=30)subheadline=service;}
 const normalizedRaw=upper(safe(raw));
 const effectiveSubheadline=textChoice==="title"?"":subheadline;
 return Object.freeze({version:VERSION,headline,subheadline:effectiveSubheadline,rewritten:normalizedRaw!==headline&&normalizedRaw!==[headline,effectiveSubheadline].filter(Boolean).join(" | "),reason:"emotional-marketing-rewrite",sourceSubject:raw});
}
module.exports={VERSION,buildImageCopyStrategy};
