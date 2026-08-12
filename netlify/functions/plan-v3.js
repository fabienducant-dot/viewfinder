"use strict";
const {planV3,withPsioReferenceStatus}=require("./_shared/v3-pipeline");
const {getPsioStatus}=require("./_shared/v3-psio-references");
exports.handler=async event=>{if(event.httpMethod!=="POST")return {statusCode:405,body:"Method Not Allowed"};try{let plan=planV3(JSON.parse(event.body||"{}"));plan=withPsioReferenceStatus(plan,await getPsioStatus(plan.psioRequired));return {statusCode:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(plan)};}catch(error){return {statusCode:400,headers:{"Content-Type":"application/json"},body:JSON.stringify({error:String(error.message||error)})};}};
