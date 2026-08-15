"use strict";
const {getStore}=require("@netlify/blobs");
const PSIO_REFERENCES=Object.freeze([
 {id:"vf-psio-reference-profile-worn",role:"profile_worn",label:"Profil porté"},
 {id:"vf-psio-reference-front-worn",role:"front_worn",label:"Face portée"},
 {id:"vf-psio-reference-product",role:"product",label:"Produit isolé"},
]);
function openStore(){const opts={consistency:"strong"};if(process.env.BLOBS_SITE_ID&&process.env.BLOBS_TOKEN)return getStore({name:"viewfinder-data",siteID:process.env.BLOBS_SITE_ID,token:process.env.BLOBS_TOKEN,...opts});return getStore({name:"viewfinder-data",...opts});}
function psioRequiredForContract(contract){return /PSIO|PSiO/.test([contract?.name,...(contract?.requiredCompositeStages||[])].join(" "));}
function statusFromRecords(records={},required=true){const references=PSIO_REFERENCES.map(ref=>{const record=records[ref.id];return {...ref,available:Boolean(record?.dataUrl),updatedAt:record?.updatedAt||null,previewUrl:record?.dataUrl?`/.netlify/functions/psio-references?id=${encodeURIComponent(ref.id)}`:null};});return {psioRequired:required,psioReferenceStatus:required?(references.every(x=>x.available)?"ready":"missing"):"not_required",psioReferenceIds:required?references.filter(x=>x.available).map(x=>x.id):[],psioReferenceCount:required?references.filter(x=>x.available).length:0,psioReferenceRoles:required?references.map(x=>({id:x.id,role:x.role,label:x.label,available:x.available})):[],psioReferenceReady:required?references.every(x=>x.available):true,references};}
async function readPsioReferences(store=openStore()){const entries=await Promise.all(PSIO_REFERENCES.map(async ref=>{const raw=await store.get(ref.id);return [ref.id,raw?JSON.parse(raw):null];}));return Object.fromEntries(entries);}
async function getPsioStatus(required=true,store=openStore()){return statusFromRecords(await readPsioReferences(store),required);}
async function getPsioDataUrls(store=openStore()){const records=await readPsioReferences(store);return PSIO_REFERENCES.map(ref=>records[ref.id]?.dataUrl).filter(Boolean);}
async function getPsioReferencesForRoles(roles,store=openStore()){const records=await readPsioReferences(store);return PSIO_REFERENCES.filter(ref=>roles.includes(ref.role)).map(ref=>({id:ref.id,role:ref.role,dataUrl:records[ref.id]?.dataUrl||null})).filter(x=>x.dataUrl);}
module.exports={PSIO_REFERENCES,openStore,psioRequiredForContract,statusFromRecords,readPsioReferences,getPsioStatus,getPsioDataUrls,getPsioReferencesForRoles};
