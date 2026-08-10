"use strict";
const {planV3}=require("./_shared/v3-pipeline");
exports.handler=async event=>{if(event.httpMethod!=="POST")return {statusCode:405,body:"Method Not Allowed"};try{const plan=planV3(JSON.parse(event.body||"{}"));return {statusCode:200,headers:{"Content-Type":"application/json"},body:JSON.stringify(plan)};}catch(error){return {statusCode:400,headers:{"Content-Type":"application/json"},body:JSON.stringify({error:String(error.message||error)})};}};
