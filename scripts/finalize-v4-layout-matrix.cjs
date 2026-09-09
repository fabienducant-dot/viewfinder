'use strict';
const fs=require('node:fs');

function replaceBetween(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
  if(start<0||end<0)throw new Error(`Missing marker ${label}`);
  return source.slice(0,start)+replacement+source.slice(end);
}
function mustReplace(source,oldValue,newValue,label){
  if(!source.includes(oldValue))throw new Error(`Missing exact marker ${label}`);
  return source.replace(oldValue,newValue);
}

const layoutModule=`"use strict";

const VERSION="4.0.0-matrix-safe-typography";
const WEAK_WORDS=new Set(["DE","DU","DES","LE","LA","LES","UN","UNE","À","AU","AUX","ET","OU","POUR","DANS"]);
const POLICIES=Object.freeze({
  "Story":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:48,subtitlePreferred:30,titleHardMin:26,subtitleHardMin:18}),
  "Instagram Square":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:52,subtitlePreferred:29,titleHardMin:25,subtitleHardMin:18}),
  "Instagram Portrait":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:56,subtitlePreferred:31,titleHardMin:27,subtitleHardMin:18}),
  "Facebook":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:56,subtitlePreferred:31,titleHardMin:27,subtitleHardMin:18}),
  "Google Business":Object.freeze({titleMaxLines:2,subtitleMaxLines:1,titlePreferred:46,subtitlePreferred:25,titleHardMin:24,subtitleHardMin:16}),
  "Blog":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:48,subtitlePreferred:27,titleHardMin:23,subtitleHardMin:16}),
  "Bannière":Object.freeze({titleMaxLines:2,subtitleMaxLines:2,titlePreferred:38,subtitlePreferred:22,titleHardMin:20,subtitleHardMin:15}),
});
function clean(value){return String(value||"").trim().replace(/\\s+/g," ");}
function stripPunctuation(value){return String(value||"").replace(/[.,;:!?…]+$/g,"");}
function wrapMeasured(text,fontSize,safeWidth,maxLines,measure){
  const words=clean(text).split(/\\s+/).filter(Boolean);if(!words.length)return [];
  const lines=[];let line="";
  for(const word of words){
    if(measure(word,fontSize)>safeWidth)return null;
    const next=line?`${line} ${word}`:word;
    if(!line||measure(next,fontSize)<=safeWidth)line=next;
    else{lines.push(line);line=word;if(lines.length>=maxLines)return null;}
  }
  if(line)lines.push(line);if(lines.length>maxLines)return null;
  for(let i=0;i<lines.length-1;i++){
    const parts=lines[i].split(/\\s+/),last=parts.at(-1),weak=WEAK_WORDS.has(stripPunctuation(last).toUpperCase());
    if(!weak||parts.length<2)continue;
    const current=parts.slice(0,-1).join(" "),next=`${last} ${lines[i+1]}`;
    if(measure(next,fontSize)<=safeWidth){lines[i]=current;lines[i+1]=next;}
  }
  return lines.every(line=>measure(line,fontSize)<=safeWidth)?lines:null;
}
function exact(lines,text){return clean(lines.join(" "))===clean(text);}
function scaled(base,scale){return Math.max(1,Math.round(base*scale));}
function resolveTypographyLayout({platform,title,subtitle,textMode,safeWidth,safeHeight,scale=1,measureTitle,measureSubtitle}){
  const policy=POLICIES[platform]||POLICIES["Instagram Portrait"],titleText=clean(title),subtitleText=textMode==="TEXT_MODE_MINIMAL"||textMode==="TEXT_MODE_NONE"?"":clean(subtitle);
  const xGuard=Math.max(14,Math.round(safeWidth*.035)),yGuard=Math.max(10,Math.round(safeHeight*.06)),innerWidth=Math.max(40,safeWidth-xGuard*2),innerHeight=Math.max(24,safeHeight-yGuard*2),effectiveScale=Math.max(.82,Math.min(1.35,Number(scale)||1));
  if(!titleText&&!subtitleText)return Object.freeze({story:platform==="Story",titleLines:[],subtitleLines:[],titleSize:0,subtitleSize:0,safeWidth:innerWidth,safeHeight:innerHeight,usedHeight:0,titleMaxLines:policy.titleMaxLines,subtitleMaxLines:policy.subtitleMaxLines,titleLineHeight:0,subtitleLineHeight:0,sectionGap:0,xGuard,yGuard,exact:true,fallbackLevel:0,policy});
  const titlePreferred=scaled(policy.titlePreferred,effectiveScale),subtitlePreferred=scaled(policy.subtitlePreferred,effectiveScale),titleHardMin=scaled(policy.titleHardMin,effectiveScale),subtitleHardMin=scaled(policy.subtitleHardMin,effectiveScale);
  const titleCandidates=titleText?Array.from({length:titlePreferred-titleHardMin+1},(_,i)=>titlePreferred-i):[0];
  const subtitleCandidates=subtitleText?Array.from({length:subtitlePreferred-subtitleHardMin+1},(_,i)=>subtitlePreferred-i):[0];
  for(const titleSize of titleCandidates){
    const titleLines=titleText?wrapMeasured(titleText,titleSize,innerWidth,policy.titleMaxLines,measureTitle):[];if(titleText&&!titleLines)continue;
    for(const subtitleSize of subtitleCandidates){
      const subtitleLines=subtitleText?wrapMeasured(subtitleText,subtitleSize,innerWidth,policy.subtitleMaxLines,measureSubtitle):[];if(subtitleText&&!subtitleLines)continue;
      const titleLineHeight=titleSize?Math.ceil(titleSize*1.18):0,subtitleLineHeight=subtitleSize?Math.ceil(subtitleSize*1.22):0,sectionGap=titleLines.length&&subtitleLines.length?Math.max(10,Math.round(Math.max(titleSize*.28,subtitleSize*.48))):0,titleHeight=titleLines.length*titleLineHeight,subtitleHeight=subtitleLines.length*subtitleLineHeight,usedHeight=titleHeight+sectionGap+subtitleHeight;
      if(usedHeight>innerHeight)continue;
      const isExact=exact(titleLines,titleText)&&exact(subtitleLines,subtitleText);if(!isExact)continue;
      return Object.freeze({story:platform==="Story",titleLines:Object.freeze(titleLines),subtitleLines:Object.freeze(subtitleLines),titleSize,subtitleSize,safeWidth:innerWidth,safeHeight:innerHeight,usedHeight,titleMaxLines:policy.titleMaxLines,subtitleMaxLines:policy.subtitleMaxLines,titleLineHeight,subtitleLineHeight,sectionGap,xGuard,yGuard,exact:true,fallbackLevel:(titlePreferred-titleSize)+(subtitlePreferred-subtitleSize),policy});
    }
  }
  throw new Error(`Texte impossible à composer sans débordement sur ${platform}: « ${titleText} » / « ${subtitleText} »`);
}
function computeTypographyGeometry({layout,typography,measureTitle,measureSubtitle}){
  const centerX=layout.x+layout.width/2,safeLeft=centerX-typography.safeWidth/2,safeRight=centerX+typography.safeWidth/2,safeTop=layout.textArea.top+typography.yGuard,safeBottom=layout.textArea.bottom-typography.yGuard;
  let cursor=safeTop;const titleBoxes=[],subtitleBoxes=[];
  for(const line of typography.titleLines){const width=measureTitle(line,typography.titleSize),top=cursor,bottom=top+typography.titleLineHeight;titleBoxes.push(Object.freeze({line,left:centerX-width/2,right:centerX+width/2,top,bottom,baseline:top+Math.round(typography.titleSize*.90),width}));cursor=bottom;}
  if(titleBoxes.length&&typography.subtitleLines.length)cursor+=typography.sectionGap;
  for(const line of typography.subtitleLines){const width=measureSubtitle(line,typography.subtitleSize),top=cursor,bottom=top+typography.subtitleLineHeight;subtitleBoxes.push(Object.freeze({line,left:centerX-width/2,right:centerX+width/2,top,bottom,baseline:top+Math.round(typography.subtitleSize*.90),width}));cursor=bottom;}
  const boxes=[...titleBoxes,...subtitleBoxes],bounds=boxes.length?Object.freeze({left:Math.min(...boxes.map(x=>x.left)),right:Math.max(...boxes.map(x=>x.right)),top:Math.min(...boxes.map(x=>x.top)),bottom:Math.max(...boxes.map(x=>x.bottom))}):Object.freeze({left:centerX,right:centerX,top:safeTop,bottom:safeTop});
  const withinSafeArea=bounds.left>=safeLeft-0.01&&bounds.right<=safeRight+0.01&&bounds.top>=safeTop-0.01&&bounds.bottom<=safeBottom+0.01;
  return Object.freeze({centerX,safeLeft,safeRight,safeTop,safeBottom,titleBoxes:Object.freeze(titleBoxes),subtitleBoxes:Object.freeze(subtitleBoxes),bounds,withinSafeArea});
}
module.exports={VERSION,POLICIES,wrapMeasured,resolveTypographyLayout,computeTypographyGeometry};
`;
fs.writeFileSync('netlify/functions/_shared/v4-brand-layout.js',layoutModule);

let p='netlify/functions/_shared/brand-compositor.js';
let s=fs.readFileSync(p,'utf8');
s=mustReplace(s,'const BRAND_TOKENS=require("./v3-brand-tokens");\nconst {semanticLines}=require("./v3-creative-strategy");','const BRAND_TOKENS=require("./v3-brand-tokens");\nconst {semanticLines}=require("./v3-creative-strategy");\nconst {resolveTypographyLayout,computeTypographyGeometry,VERSION:TYPOGRAPHY_ENGINE_VERSION}=require("./v4-brand-layout");','layout module require');
const typography=`function typographyFor({layout,width,height,platform,title,subtitle,posterStrategy,textMode}){
 const normalized=normalizePlatform(platform),scale=Math.max(.82,Math.min(1.35,width/1088)),safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2),safeHeight=Math.max(1,layout.textArea.bottom-layout.textArea.top);
 return resolveTypographyLayout({platform:normalized,title,subtitle,textMode,safeWidth,safeHeight,scale,measureTitle:(line,size)=>measureVectorText(DISPLAY_FONT,line,size),measureSubtitle:(line,size)=>measureVectorText(TEXT_FONT,line,size)});
}

`;
s=replaceBetween(s,'function typographyFor(', 'function buildOverlaySvg',typography+'function buildOverlaySvg','typographyFor');
const overlay=`function buildOverlaySvg(width,height,layout,platform,headline,posterStrategy,brandLockup){
 const {title,subtitle}=headlineParts(headline),textMode=posterStrategy?.textMode||"TEXT_MODE_EDITORIAL",t=typographyFor({layout,width,height,platform,title,subtitle,posterStrategy,textMode}),geometry=computeTypographyGeometry({layout,typography:t,measureTitle:(line,size)=>measureVectorText(DISPLAY_FONT,line,size),measureSubtitle:(line,size)=>measureVectorText(TEXT_FONT,line,size)}),titleNodes=t.titleLines.map((line,i)=>vectorText(DISPLAY_FONT,line,geometry.centerX,geometry.titleBoxes[i].baseline,t.titleSize,"title")).join(""),subtitleNodes=t.subtitleLines.map((line,i)=>vectorText(TEXT_FONT,line,geometry.centerX,geometry.subtitleBoxes[i].baseline,t.subtitleSize,"subtitle")).join(""),headlineEnd=geometry.bounds.bottom,dividerY=Math.min(layout.textArea.bottom-Math.round(height*.008),headlineEnd+Math.round(height*.010)),scrimTop=Math.max(0,layout.textArea.top-Math.round(height*.020)),scrimBottom=Math.min(height,layout.textArea.bottom+Math.round(height*.020));
 const brandFont=brandLockup?(brandLockup.nameFont==="display"?DISPLAY_FONT:BRAND_FONT):DISPLAY_FONT,brandNodes=brandLockup?\`${'${'}vectorText(brandFont,brandLockup.name,brandLockup.centerX,brandLockup.brandBaseline,brandLockup.brandSize,"brand")}${'${'}vectorText(TEXT_FONT,brandLockup.location,brandLockup.centerX,brandLockup.cityBaseline,brandLockup.citySize,"city")}\`:"";
 return Buffer.from(\`<svg width="${'${'}width}" height="${'${'}height}" viewBox="0 0 ${'${'}width} ${'${'}height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505" stop-opacity="0"/><stop offset="0.30" stop-color="#050505" stop-opacity="0.14"/><stop offset="0.72" stop-color="#050505" stop-opacity="0.24"/><stop offset="1" stop-color="#050505" stop-opacity="0"/></linearGradient><style>.brand,.city,.title,.subtitle{paint-order:stroke fill;stroke:#050505;stroke-opacity:.68}.brand{fill:${'${'}brandLockup?.nameColor||GOLD};stroke-width:2px}.city{fill:${'${'}brandLockup?.locationColor||IVORY};stroke-width:1px}.title{fill:${'${'}IVORY};stroke-width:3px}.subtitle{fill:${'${'}PALE_GOLD};stroke-width:2px}</style></defs><rect x="0" y="${'${'}scrimTop}" width="${'${'}width}" height="${'${'}scrimBottom-scrimTop}" fill="url(#scrim)"/><line x1="${'${'}layout.x+layout.width*.40}" y1="${'${'}dividerY}" x2="${'${'}layout.x+layout.width*.60}" y2="${'${'}dividerY}" stroke="${'${'}GOLD}" stroke-width="1" stroke-opacity=".42"/>${'${'}brandNodes}${'${'}titleNodes}${'${'}subtitleNodes}</svg>\`);
}

`;
s=replaceBetween(s,'function buildOverlaySvg(', 'function buildSupersampledBrandTextSvg',overlay+'function buildSupersampledBrandTextSvg','buildOverlaySvg');
const oldInit='const layout=layoutFor(width,height,platform,zoneText,Boolean(String(headline||"").trim()),selectedLayout,posterStrategy),{title,subtitle}=headlineParts(headline),t=typographyFor({layout,width,height,platform,title,subtitle,posterStrategy,textMode}),centerX=layout.x+layout.width/2,textTop=layout.textArea.top+Math.round((layout.textArea.bottom-layout.textArea.top)*.08),textY=textTop+t.titleSize+t.titleLines.length*t.titleSize*1.05+t.subtitleSize*.45;';
const newInit='const layout=layoutFor(width,height,platform,zoneText,Boolean(String(headline||"").trim()),selectedLayout,posterStrategy),{title,subtitle}=headlineParts(headline),t=typographyFor({layout,width,height,platform,title,subtitle,posterStrategy,textMode}),textGeometry=computeTypographyGeometry({layout,typography:t,measureTitle:(line,size)=>measureVectorText(DISPLAY_FONT,line,size),measureSubtitle:(line,size)=>measureVectorText(TEXT_FONT,line,size)}),centerX=textGeometry.centerX;if(!textGeometry.withinSafeArea)throw new Error("Bloc typographique hors safe-zone après mesure.");';
s=mustReplace(s,oldInit,newInit,'compose typography initialization');
const oldVars='const norm=v=>String(v||"").trim().replace(/\\s+/g," "),titleWidths=t.titleLines.map(line=>measureVectorText(DISPLAY_FONT,line,t.titleSize)),subtitleWidths=t.subtitleLines.map(line=>measureVectorText(TEXT_FONT,line,t.subtitleSize)),titleBottom=textTop+t.titleLines.length*t.titleSize*1.05,subtitleTop=t.subtitleLines.length?textY-t.subtitleSize:0,subtitleBottom=t.subtitleLines.length?textY+(t.subtitleLines.length-1)*t.subtitleSize*1.10:0,ratio=finalLogoWidth/width,logoScaleValid=ratio>=BRAND_TOKENS.logoMinimumScale-.005&&ratio<=BRAND_TOKENS.logoMaximumScale+.005;';
const newVars='const norm=v=>String(v||"").trim().replace(/\\s+/g," "),titleWidths=t.titleLines.map(line=>measureVectorText(DISPLAY_FONT,line,t.titleSize)),subtitleWidths=t.subtitleLines.map(line=>measureVectorText(TEXT_FONT,line,t.subtitleSize)),titleBottom=textGeometry.titleBoxes.length?textGeometry.titleBoxes.at(-1).bottom:textGeometry.safeTop,subtitleTop=textGeometry.subtitleBoxes.length?textGeometry.subtitleBoxes[0].top:0,subtitleBottom=textGeometry.subtitleBoxes.length?textGeometry.subtitleBoxes.at(-1).bottom:0,ratio=finalLogoWidth/width,logoScaleValid=ratio>=BRAND_TOKENS.logoMinimumScale-.005&&ratio<=BRAND_TOKENS.logoMaximumScale+.005;';
s=mustReplace(s,oldVars,newVars,'manifest geometry vars');
s=mustReplace(s,'version:COMPOSITOR_VERSION,platform:normalizePlatform(platform),','version:COMPOSITOR_VERSION,typographyEngineVersion:TYPOGRAPHY_ENGINE_VERSION,platform:normalizePlatform(platform),','manifest typography version');
s=mustReplace(s,'titleBounds:{left:centerX-Math.max(0,...titleWidths)/2,top:textTop,right:centerX+Math.max(0,...titleWidths)/2,bottom:titleBottom},subtitleBounds:t.subtitleLines.length?{left:centerX-Math.max(...subtitleWidths)/2,top:subtitleTop,right:centerX+Math.max(...subtitleWidths)/2,bottom:subtitleBottom}:null,safeWidth:t.safeWidth,safeHeight:layout.textArea.bottom-layout.textArea.top,usedHeight:t.usedHeight,','titleBounds:t.titleLines.length?{left:Math.min(...textGeometry.titleBoxes.map(x=>x.left)),top:textGeometry.titleBoxes[0].top,right:Math.max(...textGeometry.titleBoxes.map(x=>x.right)),bottom:titleBottom}:null,subtitleBounds:t.subtitleLines.length?{left:Math.min(...textGeometry.subtitleBoxes.map(x=>x.left)),top:subtitleTop,right:Math.max(...textGeometry.subtitleBoxes.map(x=>x.right)),bottom:subtitleBottom}:null,textGeometryBounds:textGeometry.bounds,textSafeEnvelope:{left:textGeometry.safeLeft,top:textGeometry.safeTop,right:textGeometry.safeRight,bottom:textGeometry.safeBottom},titleMaxLines:t.titleMaxLines,subtitleMaxLines:t.subtitleMaxLines,typographyFallbackLevel:t.fallbackLevel,safeWidth:t.safeWidth,safeHeight:t.safeHeight,usedHeight:t.usedHeight,','manifest bounds');
s=mustReplace(s,'textWithinCanvas:[...titleWidths,...subtitleWidths].every(v=>v<=t.safeWidth)&&t.usedHeight<=layout.textArea.bottom-layout.textArea.top,','textWithinCanvas:textGeometry.withinSafeArea&&[...titleWidths,...subtitleWidths].every(v=>v<=t.safeWidth)&&t.usedHeight<=t.safeHeight,','manifest text safe');
fs.writeFileSync(p,s);

const testFile=`"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const sharp=require("sharp");
const {SERVICE_REGISTRY,GENERIC_SUBJECT_CONTRACT}=require("../netlify/functions/_shared/v3-registry");
const {PLATFORM_TEMPLATES}=require("../netlify/functions/_shared/v3-layout-engine");
const {composeBrandPoster}=require("../netlify/functions/_shared/brand-compositor");
const {resolveTypographyLayout,POLICIES,VERSION}=require("../netlify/functions/_shared/v4-brand-layout");

const services=[...Object.values(SERVICE_REGISTRY),GENERIC_SUBJECT_CONTRACT];
const platforms=Object.keys(PLATFORM_TEMPLATES);
const stressSubtitle="DOULEURS DORSALES, BLOCAGE, SENSATIONS DE LOURDEUR";
const extremeSubtitle="BESOIN DE SOUFFLER, DE DÉCHARGER LES TENSIONS MENTALES ET PHYSIQUES, DE RETROUVER DE L’ESPACE ET DE LA LÉGÈRETÉ";
const measure=(text,size)=>String(text).length*size*.58;

test("le moteur typographique V4 refuse tout débordement et conserve le texte exact",()=>{
  assert.equal(VERSION,"4.0.0-matrix-safe-typography");
  for(const platform of platforms){
    const p=POLICIES[platform];assert.ok(p,platform);
    for(const c of services){
      const title=c.name.toUpperCase(),subtitle=stressSubtitle;
      const t=resolveTypographyLayout({platform,title,subtitle,textMode:platform==="Google Business"?"TEXT_MODE_MINIMAL":"TEXT_MODE_EDITORIAL",safeWidth:platform==="Bannière"?820:platform==="Blog"?760:900,safeHeight:platform==="Bannière"?180:230,scale:1,measureTitle:measure,measureSubtitle:measure});
      assert.equal(t.titleLines.join(" "),title,`${platform}/${c.name}/title`);assert.ok(t.titleLines.length<=p.titleMaxLines,`${platform}/${c.name}/title lines`);assert.ok(t.subtitleLines.length<=p.subtitleMaxLines,`${platform}/${c.name}/subtitle lines`);assert.ok(t.usedHeight<=t.safeHeight,`${platform}/${c.name}/height`);
    }
  }
});

test("matrice Sharp complète 19 sujets × 7 formats : aucun texte, logo ou signature hors cadre",async()=>{
  const source=await sharp({create:{width:1024,height:1024,channels:4,background:{r:31,g:31,b:31,alpha:1}}}).png().toBuffer();
  let count=0;
  for(const platform of platforms){
    const template=PLATFORM_TEMPLATES[platform],policy=POLICIES[platform];
    for(const c of services){
      const title=c.name.toUpperCase(),subtitle=platform==="Google Business"?"":stressSubtitle;
      const posterStrategy={textMode:platform==="Google Business"?"TEXT_MODE_NONE":"TEXT_MODE_EDITORIAL",title,subtitle,titleLines:[title],subtitleLines:subtitle?[subtitle]:[],logoScale:"prominent"};
      const output=await composeBrandPoster({imageBuffer:source,platform,posterStrategy});const meta=await sharp(output).metadata(),m=output.compositionManifest;
      assert.deepEqual([meta.width,meta.height],[template.width,template.height],`${platform}/${c.name}/dimensions`);
      for(const key of ["titleExact","subtitleExact","textWithinCanvas","marginsValid","zonesDisjoint","logoWithinCanvas","logoAssetIntegrity","logoScaleValid"])assert.equal(m[key],true,`${platform}/${c.name}/${key}`);
      assert.equal(m.typographyEngineVersion,VERSION,`${platform}/${c.name}/engine`);assert.ok(m.titleLines.length<=policy.titleMaxLines,`${platform}/${c.name}/title lines`);assert.ok(m.subtitleLines.length<=policy.subtitleMaxLines,`${platform}/${c.name}/subtitle lines`);
      if(m.titleBounds){assert.ok(m.titleBounds.left>=m.textSafeEnvelope.left-1,`${platform}/${c.name}/title left`);assert.ok(m.titleBounds.right<=m.textSafeEnvelope.right+1,`${platform}/${c.name}/title right`);assert.ok(m.titleBounds.top>=m.textSafeEnvelope.top-1,`${platform}/${c.name}/title top`);assert.ok(m.titleBounds.bottom<=m.textSafeEnvelope.bottom+1,`${platform}/${c.name}/title bottom`);}
      if(m.subtitleBounds){assert.ok(m.subtitleBounds.left>=m.textSafeEnvelope.left-1,`${platform}/${c.name}/subtitle left`);assert.ok(m.subtitleBounds.right<=m.textSafeEnvelope.right+1,`${platform}/${c.name}/subtitle right`);assert.ok(m.subtitleBounds.bottom<=m.textSafeEnvelope.bottom+1,`${platform}/${c.name}/subtitle bottom`);}
      assert.ok(m.brandLockup.bottom<=m.height-m.brandLockup.minimumBottomMargin,`${platform}/${c.name}/brand bottom`);assert.ok(m.logoBounds.left>=0&&m.logoBounds.right<=m.width&&m.logoBounds.top>=0&&m.logoBounds.bottom<=m.height,`${platform}/${c.name}/logo bounds`);count++;
    }
  }
  assert.equal(count,services.length*platforms.length);assert.equal(count,133);
});

test("stress texte long sur chaque format : réduction contrôlée, jamais de clipping",async()=>{
  const source=await sharp({create:{width:1024,height:1024,channels:4,background:{r:18,g:18,b:18,alpha:1}}}).png().toBuffer();
  for(const platform of platforms){
    const posterStrategy={textMode:platform==="Google Business"?"TEXT_MODE_MINIMAL":"TEXT_MODE_EDITORIAL",title:"RÉFLEXOLOGIE PLANTAIRE THAÏLANDAISE",subtitle:platform==="Google Business"?"":extremeSubtitle,titleLines:["RÉFLEXOLOGIE PLANTAIRE THAÏLANDAISE"],subtitleLines:[extremeSubtitle],logoScale:"prominent"};
    const output=await composeBrandPoster({imageBuffer:source,platform,posterStrategy}),m=output.compositionManifest;assert.equal(m.textWithinCanvas,true,platform);assert.equal(m.titleExact,true,platform);assert.equal(m.subtitleExact,true,platform);assert.ok(m.titleLines.length<=POLICIES[platform].titleMaxLines,platform);assert.ok(m.subtitleLines.length<=POLICIES[platform].subtitleMaxLines,platform);assert.ok(m.brandLockup.bottom<=m.height-m.brandLockup.minimumBottomMargin,platform);
  }
});
`;
fs.writeFileSync('tests/v4-brand-layout-matrix.test.js',testFile);
console.log('V4 layout matrix patch staged');
