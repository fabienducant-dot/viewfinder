'use strict';
const fs=require('node:fs');
function mustReplace(source,oldValue,newValue,label){if(!source.includes(oldValue))throw new Error(`Missing ${label}`);return source.replace(oldValue,newValue);}
const p='netlify/functions/_shared/brand-compositor.js';
let s=fs.readFileSync(p,'utf8');
s=mustReplace(s,
'const BRAND_TOKENS=require("./v3-brand-tokens");\nconst {semanticLines}=require("./v3-creative-strategy");',
'const BRAND_TOKENS=require("./v3-brand-tokens");\nconst {semanticLines}=require("./v3-creative-strategy");\nconst {resolveTypographyLayout,VERSION:TYPOGRAPHY_ENGINE_VERSION}=require("./v4-brand-layout");',
'layout require');
const oldTypography='function typographyFor({layout,width,height,platform,title,subtitle,posterStrategy,textMode}){const story=normalizePlatform(platform)==="Story",scale=Math.max(.78,Math.min(1.55,width/1088)),titleLines=posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22),subtitleLines=textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28)),safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2),type=fitTypography({titleLines,subtitleLines,safeWidth,safeHeight:Math.max(1,layout.textArea.bottom-layout.textArea.top-Math.round(height*.018)),preferredTitle:Math.round((story?48:(layout.portrait?67:62))*scale),preferredSubtitle:Math.round((story?30:(layout.portrait?40:36))*scale),minimumTitle:Math.round(24*scale),minimumSubtitle:Math.round(18*scale)});return {story,scale,titleLines,subtitleLines,safeWidth,...type};}';
const newTypography='function typographyFor({layout,width,height,platform,title,subtitle,posterStrategy,textMode}){const normalized=normalizePlatform(platform),scale=Math.max(.82,Math.min(1.35,width/1088)),safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2),safeHeight=Math.max(1,layout.textArea.bottom-layout.textArea.top-Math.round(height*.018));return resolveTypographyLayout({platform:normalized,title,subtitle,textMode,safeWidth,safeHeight,scale,measureTitle:(line,size)=>measureVectorText(DISPLAY_FONT,line,size),measureSubtitle:(line,size)=>measureVectorText(TEXT_FONT,line,size)});}';
s=mustReplace(s,oldTypography,newTypography,'typography function');
s=mustReplace(s,'const manifest=Object.freeze({version:COMPOSITOR_VERSION,platform:normalizePlatform(platform),','const manifest=Object.freeze({version:COMPOSITOR_VERSION,typographyEngineVersion:TYPOGRAPHY_ENGINE_VERSION,platform:normalizePlatform(platform),','manifest engine version');
s=mustReplace(s,'safeWidth:t.safeWidth,safeHeight:layout.textArea.bottom-layout.textArea.top,usedHeight:t.usedHeight,','safeWidth:t.safeWidth,safeHeight:t.safeHeight,usedHeight:t.usedHeight,titleMaxLines:t.titleMaxLines,subtitleMaxLines:t.subtitleMaxLines,typographyFallbackLevel:t.fallbackLevel,','manifest typography metrics');
s=mustReplace(s,'textWithinCanvas:[...titleWidths,...subtitleWidths].every(v=>v<=t.safeWidth)&&t.usedHeight<=layout.textArea.bottom-layout.textArea.top,','textWithinCanvas:[...titleWidths,...subtitleWidths].every(v=>v<=t.safeWidth)&&t.usedHeight<=t.safeHeight,','manifest text bounds');
fs.writeFileSync(p,s);
console.log('Production compositor now uses matrix-safe typography');
