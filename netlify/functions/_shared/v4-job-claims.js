"use strict";
const {randomUUID}=require("node:crypto");
// A paid execution claim is never expired automatically: a timeout is not proof
// that the provider did not receive the request.
async function reserveOnce(store,key,record){
 const owner=randomUUID();
 const result=await store.set(key,JSON.stringify({...record,owner}),{onlyIfNew:true});
 if(typeof result?.modified!=="boolean")throw new Error("Écriture atomique non confirmée ; opération bloquée.");
 const raw=await store.get(key),saved=typeof raw==="string"?JSON.parse(raw):raw;
 if(!saved)throw new Error("Réservation serveur introuvable ; opération bloquée.");
 if(result.modified&&saved.owner!==owner)throw new Error("Réservation serveur incohérente ; opération bloquée.");
 return {created:result.modified,record:saved};
}
module.exports={reserveOnce};
