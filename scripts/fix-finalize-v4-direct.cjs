'use strict';
const fs=require('node:fs');
const path='scripts/finalize-v4-direct.cjs';
let s=fs.readFileSync(path,'utf8');
const fixes=[
  ['const failure=new Error(`Analyse image V4 impossible : ${String(error.message||error)}`);','const failure=new Error("Analyse image V4 impossible : "+String(error.message||error));'],
  ['const failure=new Error(`Composition Sharp V4 impossible : ${String(error.message||error)}`);','const failure=new Error("Composition Sharp V4 impossible : "+String(error.message||error));']
];
for(const [from,to] of fixes){if(!s.includes(from))throw new Error('quoting marker missing: '+from);s=s.replace(from,to);}
fs.writeFileSync(path,s);
console.log('one-shot patch script quoting fixed');
