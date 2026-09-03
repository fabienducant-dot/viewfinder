"use strict";

const fs=require("fs");
const path=require("path");
const sharp=require("sharp");
const opentype=require("opentype.js");
const {PLATFORM_TEMPLATES,normalizePlatform}=require("./v3-layout-engine");
const BRAND_TOKENS=require("./v3-brand-tokens");
const {semanticLines}=require("./v3-creative-strategy");

const GOLD=BRAND_TOKENS.brandGold,PALE_GOLD=BRAND_TOKENS.brandPaleGold,IVORY=BRAND_TOKENS.brandIvory;
const COMPOSITOR_VERSION="3.0.0-static-official-logo";
const OFFICIAL_LOGO_PATH=path.resolve(__dirname,"../../../assets/sdz-logo-compositor.png");
const BRAND_CONTACTS=Object.freeze({domain:"la-sante-des-zebres.com",phone:"06.84.40.69.54",address:"11 cour Dupas, 59590 Raismes",email:"fabien.ducant@gmail.com"});

const DISPLAY_LATIN_PATH=require.resolve("@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff");
const DISPLAY_EXTENDED_PATH=require.resolve("@fontsource/cormorant-garamond/files/cormorant-garamond-latin-ext-600-normal.woff");
const TEXT_LATIN_PATH=require.resolve("@fontsource/manrope/files/manrope-latin-500-normal.woff");
const TEXT_EXTENDED_PATH=require.resolve("@fontsource/manrope/files/manrope-latin-ext-500-normal.woff");
const BRAND_LATIN_PATH=require.resolve("@fontsource/manrope/files/manrope-latin-600-normal.woff");
const BRAND_EXTENDED_PATH=require.resolve("@fontsource/manrope/files/manrope-latin-ext-600-normal.woff");
const FONT_PATHS=Object.freeze({displayLatin:DISPLAY_LATIN_PATH,displayExtended:DISPLAY_EXTENDED_PATH,textLatin:TEXT_LATIN_PATH,textExtended:TEXT_EXTENDED_PATH,brandLatin:BRAND_LATIN_PATH,brandExtended:BRAND_EXTENDED_PATH});

function loadFont(file){const buffer=fs.readFileSync(file);const arrayBuffer=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);return opentype.parse(arrayBuffer);}
function loadFontSet(latinPath,extendedPath){return {latin:loadFont(latinPath),extended:loadFont(extendedPath)};}
const DISPLAY_FONT=loadFontSet(DISPLAY_LATIN_PATH,DISPLAY_EXTENDED_PATH);
const TEXT_FONT=loadFontSet(TEXT_LATIN_PATH,TEXT_EXTENDED_PATH);
const BRAND_FONT=loadFontSet(BRAND_LATIN_PATH,BRAND_EXTENDED_PATH);

let OFFICIAL_LOGO_CACHE=null;

function escapeXml(value){return String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
function normalizedZone(value,platform){const raw=String(value||"").toLowerCase();if(/sup|haut|top/.test(raw))return "top";if(/centre|milieu|center/.test(raw))return "center";if(/inf|bas|bottom/.test(raw))return "bottom";return platform==="Story"?"top":"bottom";}
function wrapWords(text,maxChars,maxLines){const words=String(text||"").trim().split(/\s+/).filter(Boolean),lines=[];let line="";for(const word of words){const candidate=line?`${line} ${word}`:word;if(candidate.length<=maxChars||!line)line=candidate;else{lines.push(line);line=word;if(lines.length===maxLines-1)break;}}if(line&&lines.length<maxLines)lines.push(line);const consumed=lines.join(" ").split(/\s+/).filter(Boolean).length;if(consumed<words.length&&lines.length)lines[lines.length-1]=`${lines[lines.length-1].replace(/[.…]+$/,"")}…`;return lines;}
function headlineParts(headline){const parts=String(headline||"").split("|").map(v=>v.trim()).filter(Boolean);return {title:parts[0]||"",subtitle:parts.slice(1).join(" — ")};}

function vectorText(fontSet,text,centerX,baselineY,fontSize,className){const value=String(text||"");if(!value)return "";const runs=Array.from(value).map(character=>{const latinGlyph=fontSet.latin.charToGlyph(character);const useExtended=latinGlyph.index===0&&character!=="\0";const font=useExtended?fontSet.extended:fontSet.latin;const glyph=useExtended?font.charToGlyph(character):latinGlyph;return {font,glyph};});const advances=runs.map(({font,glyph})=>(glyph.advanceWidth||font.unitsPerEm*.38)*fontSize/font.unitsPerEm);const width=advances.reduce((sum,advance)=>sum+advance,0);let x=centerX-width/2;const paths=runs.map(({glyph},index)=>{const node=glyph.getPath(x,baselineY,fontSize).toPathData(2);x+=advances[index];return node;}).join("");return `<path d="${paths}" class="${className}"/>`;}
function measureVectorText(fontSet,text,fontSize,letterSpacing=0){const chars=Array.from(String(text||""));return chars.reduce((sum,character)=>{const latin=fontSet.latin.charToGlyph(character);const font=latin.index===0&&character!=="\0"?fontSet.extended:fontSet.latin;const glyph=font.charToGlyph(character);return sum+(glyph.advanceWidth||font.unitsPerEm*.38)*fontSize/font.unitsPerEm;},0)+Math.max(0,chars.length-1)*letterSpacing;}
function fitFontSize(fontSet,lines,preferred,minimum,safeWidth){let size=preferred;while(size>minimum&&lines.some(line=>measureVectorText(fontSet,line,size)>safeWidth))size--;return size;}
function fitTypography({titleLines,subtitleLines,safeWidth,safeHeight,preferredTitle,preferredSubtitle,minimumTitle,minimumSubtitle}){let titleSize=fitFontSize(DISPLAY_FONT,titleLines,preferredTitle,minimumTitle,safeWidth),subtitleSize=fitFontSize(TEXT_FONT,subtitleLines,preferredSubtitle,minimumSubtitle,safeWidth);const usedHeight=()=>titleLines.length*titleSize*1.08+(subtitleLines.length?subtitleSize*.55+subtitleLines.length*subtitleSize*1.12:0);while(usedHeight()>safeHeight&&(titleSize>minimumTitle||subtitleSize>minimumSubtitle)){if(titleSize>minimumTitle)titleSize--;if(subtitleSize>minimumSubtitle)subtitleSize--;}return {titleSize,subtitleSize,usedHeight:usedHeight()};}
function validateSemanticLines(lines,maximum){const weak=new Set(["À","AU","AUX","DE","DES","DU","ET","LE","LA","LES","OU","UN","UNE"]);return lines.length<=maximum&&lines.every(line=>String(line).trim()&&!weak.has(String(line).trim().toUpperCase()));}

/* Le logo doit rester une signature, jamais le sujet principal. Tous les ratios sont compris dans
   les bornes de la charte centralisée (12–24 % de la largeur du visuel). */
const PREMIUM_LOCKUP_BY_PLATFORM=Object.freeze({
  "Instagram Square":Object.freeze({family:"premium-square",textTop:.42,textBottom:.64,logoLeft:.30,logoRight:.70,logoWidthRatio:.17,brandSize:34,citySize:19}),
  "Instagram Portrait":Object.freeze({family:"premium-portrait",textTop:.43,textBottom:.65,logoLeft:.28,logoRight:.72,logoWidthRatio:.17,brandSize:36,citySize:20}),
  Facebook:Object.freeze({family:"premium-social",textTop:.43,textBottom:.65,logoLeft:.28,logoRight:.72,logoWidthRatio:.17,brandSize:36,citySize:20}),
  Story:Object.freeze({family:"premium-story",textTop:.60,textBottom:.72,logoLeft:.25,logoRight:.75,logoWidthRatio:.20,brandSize:40,citySize:23}),
  Blog:Object.freeze({family:"premium-editorial",textTop:.38,textBottom:.60,logoLeft:.36,logoRight:.64,logoWidthRatio:.12,brandSize:30,citySize:17}),
  "Bannière":Object.freeze({family:"premium-banner",textTop:.10,textBottom:.50,logoLeft:.40,logoRight:.60,logoWidthRatio:.12,brandSize:24,citySize:14}),
});
function premiumBrandLockupFor(platform){const normalized=normalizePlatform(platform);return normalized==="Google Business"?null:(PREMIUM_LOCKUP_BY_PLATFORM[normalized]||null);}
function clampLogoRatio(value){return Math.max(BRAND_TOKENS.logoMinimumScale,Math.min(BRAND_TOKENS.logoMaximumScale,Number(value)||BRAND_TOKENS.logoMinimumScale));}
function targetPremiumLogoWidth(width,lockup){return Math.round(Number(width)*clampLogoRatio(lockup?.logoWidthRatio));}
function targetStoryLogoWidth(width){return targetPremiumLogoWidth(width,PREMIUM_LOCKUP_BY_PLATFORM.Story);}
function computeBrandTailGeometry({logoBrandGap,brandSize,citySize}){const brandBaselineOffset=logoBrandGap+brandSize;const cityBaselineOffset=brandBaselineOffset+brandSize*1.24;const tailHeight=cityBaselineOffset+Math.round(citySize*.18);return Object.freeze({brandBaselineOffset,cityBaselineOffset,tailHeight});}

async function auditLogoTransparency(buffer){
  const {data,info}=await sharp(buffer,{failOn:"none"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(!info.width||!info.height||info.channels<4)throw new Error("Actif logo statique invalide : raster RGBA requis.");
  let transparent=0,opaque=0,semiDark=0,darkOpaque=0,edgeDarkOpaque=0;
  const total=info.width*info.height;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const o=(y*info.width+x)*info.channels,a=data[o+3],max=Math.max(data[o],data[o+1],data[o+2]);
    if(a<=8)transparent++;
    if(a>=245){opaque++;if(max<75)darkOpaque++;}
    if(a>8&&a<245&&max<105)semiDark++;
    if((x<2||y<2||x>=info.width-2||y>=info.height-2)&&a>=245&&max<75)edgeDarkOpaque++;
  }
  const transparentRatio=transparent/total,opaqueRatio=opaque/total,darkInteriorRatio=darkOpaque/Math.max(1,opaque);
  const fringeDetected=semiDark>0||edgeDarkOpaque>Math.round((info.width+info.height)*.02);
  const integrity=transparentRatio>.04&&opaqueRatio>.05&&opaqueRatio<.90&&darkInteriorRatio>.02&&!fringeDetected;
  return Object.freeze({width:info.width,height:info.height,transparentRatio,opaqueRatio,darkInteriorRatio,semiDark,edgeDarkOpaque,fringeDetected,integrity});
}

async function loadOfficialLogoAsset(){
  if(OFFICIAL_LOGO_CACHE)return OFFICIAL_LOGO_CACHE;
  let buffer;
  try{buffer=fs.readFileSync(OFFICIAL_LOGO_PATH);}catch(error){throw new Error(`Actif logo officiel absent du bundle : ${OFFICIAL_LOGO_PATH}`);}
  const audit=await auditLogoTransparency(buffer);
  if(!audit.integrity)throw new Error(`Actif logo officiel invalide : transparence=${audit.transparentRatio.toFixed(3)}, opaque=${audit.opaqueRatio.toFixed(3)}, halo=${audit.fringeDetected}.`);
  OFFICIAL_LOGO_CACHE=Object.freeze({buffer:Buffer.from(buffer),audit});
  return OFFICIAL_LOGO_CACHE;
}

async function hasOpaqueLogoRectangle(buffer){const audit=await auditLogoTransparency(buffer);return audit.transparentRatio<.02||audit.edgeDarkOpaque>Math.round((audit.width+audit.height)*.02);}

function layoutFor(width,height,platform,requestedZone,hasHeadline,selectedLayout,posterStrategy){
  const normalized=normalizePlatform(platform),template=(selectedLayout&&selectedLayout.template)||PLATFORM_TEMPLATES[normalized];
  if(template){
    const spec=template.lockup,margin=Math.max(Math.round(width*.06),Math.round(width*template.margins)),textSafe=posterStrategy?.textSafeArea,logoSafe=posterStrategy?.logoSafeArea,premiumLockup=premiumBrandLockupFor(normalized);
    const x=textSafe?Math.max(margin,Math.round(width*textSafe.left)):Math.max(margin,Math.round(width*spec.x));
    let y=textSafe?Math.max(margin,Math.round(height*textSafe.top)):Math.max(margin,Math.round(height*spec.y));
    const boxWidth=textSafe?Math.min(Math.round(width*(textSafe.right-textSafe.left)),width-x-margin):Math.min(Math.round(width*spec.width),width-x-margin);
    let textBottom=textSafe?Math.round(height*textSafe.bottom):Math.min(height-margin,y+Math.round(height*(hasHeadline?.18:.04)));
    if(premiumLockup){y=Math.max(margin,Math.round(height*premiumLockup.textTop));textBottom=Math.min(height-margin,Math.round(height*premiumLockup.textBottom));}
    const logoArea=logoSafe?{left:Math.round(width*logoSafe.left),right:Math.round(width*logoSafe.right),top:Math.round(height*logoSafe.top),bottom:Math.round(height*logoSafe.bottom)}:{left:x,right:x+boxWidth,top:textBottom,bottom:Math.min(height-margin,textBottom+Math.round(height*(height>width?.16:.20)))};
    if(premiumLockup){logoArea.left=Math.round(width*premiumLockup.logoLeft);logoArea.right=Math.round(width*premiumLockup.logoRight);logoArea.top=textBottom+Math.round(height*.008);logoArea.bottom=Math.min(height-margin,height-Math.max(24,Math.round(height*.035)));}
    return {x,y,width:boxWidth,height:Math.max(1,textBottom-y),margin,portrait:height>width*1.35,landscape:width>height*1.35,template,align:spec.align,textArea:{top:y,bottom:textBottom},logoArea};
  }
  const zone=hasHeadline&&["Instagram","Facebook","Story"].includes(platform)?"bottom":normalizedZone(requestedZone,platform),portrait=height>width*1.35,landscape=width>height*1.35,margin=Math.round(width*(portrait?.065:.052)),boxW=landscape?Math.round(width*.56):width-margin*2,boxH=Math.round(height*(hasHeadline?(portrait?.32:.38):.23)),x=margin;
  let y;if(zone==="top")y=Math.round(height*.055);else if(zone==="center")y=Math.round((height-boxH)*.5);else y=height-boxH-Math.round(height*(portrait?.035:.045));
  const textBottom=y+Math.round(boxH*.62);return {x,y,width:boxW,height:boxH,margin,portrait,landscape,textArea:{top:y,bottom:textBottom},logoArea:{left:x,right:x+boxW,top:textBottom,bottom:height-margin}};
}

function buildOverlaySvg(width,height,layout,platform,headline,posterStrategy,brandLockup){
  const {title,subtitle}=headlineParts(headline),story=normalizePlatform(platform)==="Story",scale=Math.max(.78,Math.min(1.55,width/1088)),safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2),preferredTitle=Math.round((story?48:(layout.portrait?67:62))*scale),preferredSubtitle=Math.round((story?30:(layout.portrait?40:36))*scale),brandSize=brandLockup.brandSize,citySize=brandLockup.citySize,textMode=posterStrategy?.textMode||"TEXT_MODE_EDITORIAL",titleLines=posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22),subtitleLines=textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28));
  const type=fitTypography({titleLines,subtitleLines,safeWidth,safeHeight:Math.max(1,layout.textArea.bottom-layout.textArea.top-Math.round(height*.018)),preferredTitle,preferredSubtitle,minimumTitle:Math.round(24*scale),minimumSubtitle:Math.round(18*scale)}),titleSize=type.titleSize,subtitleSize=type.subtitleSize,centerX=layout.x+layout.width/2,logoCenterX=brandLockup.centerX,textTop=layout.textArea.top+Math.round((layout.textArea.bottom-layout.textArea.top)*.08);
  let textY=textTop+titleSize;
  const titleNodes=titleLines.map((line,index)=>vectorText(DISPLAY_FONT,line,centerX,textY+index*titleSize*1.05,titleSize,"title")).join("");
  textY+=titleLines.length*titleSize*1.05+subtitleSize*.45;
  const subtitleNodes=subtitleLines.map((line,index)=>vectorText(TEXT_FONT,line,centerX,textY+index*subtitleSize*1.10,subtitleSize,"subtitle")).join("");
  const headlineEnd=subtitleLines.length?textY+subtitleLines.length*subtitleSize*1.10:textY,dividerY=Math.min(layout.textArea.bottom-Math.round(height*.008),headlineEnd+Math.round(height*.012)),brandY=brandLockup.brandBaseline,scrimTop=Math.max(0,layout.y-Math.round(height*.025)),scrimBottom=Math.min(height,layout.textArea.bottom+Math.round(height*.025));
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505" stop-opacity="0"/><stop offset="0.28" stop-color="#050505" stop-opacity="0.18"/><stop offset="0.72" stop-color="#050505" stop-opacity="0.30"/><stop offset="1" stop-color="#050505" stop-opacity="0"/></linearGradient><style>.brand,.city,.title,.subtitle{paint-order:stroke fill;stroke:#050505;stroke-opacity:.70}.brand{fill:${GOLD};stroke-width:2px}.city{fill:${GOLD};stroke-width:1px}.title{fill:${IVORY};stroke-width:3px}.subtitle{fill:${PALE_GOLD};stroke-width:2px}</style></defs><rect x="0" y="${scrimTop}" width="${width}" height="${scrimBottom-scrimTop}" fill="url(#scrim)"/><line x1="${layout.x+layout.width*.40}" y1="${dividerY}" x2="${layout.x+layout.width*.60}" y2="${dividerY}" stroke="${GOLD}" stroke-width="1" stroke-opacity=".42"/>${vectorText(BRAND_FONT,"LA SANTÉ DES ZÈBRES",logoCenterX,brandY,brandSize,"brand")}${vectorText(TEXT_FONT,"RAISMES",logoCenterX,brandLockup.cityBaseline,citySize,"city")}${titleNodes}${subtitleNodes}</svg>`);
}

async function composeBrandPoster({imageBuffer,platform,headline,zoneText,selectedLayout,posterStrategy}){
  if(!imageBuffer||!Buffer.isBuffer(imageBuffer))throw new Error("Image générée absente du compositeur.");
  const template=(selectedLayout&&selectedLayout.template)||PLATFORM_TEMPLATES[normalizePlatform(platform)],sourceImage=sharp(imageBuffer,{failOn:"none"}).rotate(),image=template?sourceImage.resize({width:template.width,height:template.height,fit:"cover",position:selectedLayout?.cropPosition||"attention"}):sourceImage,meta=await sourceImage.metadata(),width=template?.width||meta.width,height=template?.height||meta.height;
  if(!width||!height)throw new Error("Dimensions de l'image générée introuvables.");
  const textMode=posterStrategy?.textMode||"TEXT_MODE_EDITORIAL";if(textMode==="TEXT_MODE_NONE")headline="";else if(posterStrategy){const subtitle=textMode==="TEXT_MODE_MINIMAL"?"":posterStrategy.subtitle;headline=[posterStrategy.title,subtitle].filter(Boolean).join(" | ");}
  const hasHeadline=Boolean(String(headline||"").trim()),layout=layoutFor(width,height,platform,zoneText,hasHeadline,selectedLayout,posterStrategy),{title,subtitle}=headlineParts(headline),normalizedPlatform=normalizePlatform(platform),story=normalizedPlatform==="Story",premiumLockup=premiumBrandLockupFor(normalizedPlatform),scale=Math.max(.78,Math.min(1.55,width/1088)),titleLines=posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22),subtitleLines=textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28)),safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2);
  const type=fitTypography({titleLines,subtitleLines,safeWidth,safeHeight:Math.max(1,layout.textArea.bottom-layout.textArea.top-Math.round(height*.018)),preferredTitle:Math.round((story?48:(layout.portrait?67:62))*scale),preferredSubtitle:Math.round((story?30:(layout.portrait?40:36))*scale),minimumTitle:Math.round(24*scale),minimumSubtitle:Math.round(18*scale)}),titleSize=type.titleSize,subtitleSize=type.subtitleSize,centerX=layout.x+layout.width/2,textTop=layout.textArea.top+Math.round((layout.textArea.bottom-layout.textArea.top)*.08),textY=textTop+titleSize+titleLines.length*titleSize*1.05+subtitleSize*.45;

  const official=await loadOfficialLogoAsset(),logoMeta=await sharp(official.buffer).metadata(),fallbackRatio=posterStrategy?.logoScale==="discreet"?.12:posterStrategy?.logoScale==="standard"?.14:.16,targetRatio=clampLogoRatio(premiumLockup?.logoWidthRatio||fallbackRatio),logoAreaWidth=(layout.logoArea?.right-layout.logoArea?.left)||layout.width,desiredLogoWidth=Math.round(width*targetRatio),brandSize=Math.round((premiumLockup?premiumLockup.brandSize:(layout.portrait?28:26))*scale),citySize=Math.round((premiumLockup?premiumLockup.citySize:15)*scale),logoBrandGap=Math.max(8,Math.round(height*.006)),brandTail=computeBrandTailGeometry({logoBrandGap,brandSize,citySize}),minimumBottomMargin=Math.max(Math.round(height*.035),24),logoZoneTop=layout.logoArea?.top??layout.textArea.bottom,logoZoneBottom=(layout.logoArea?.bottom??(height-minimumBottomMargin))-brandTail.tailHeight,availableHeight=Math.max(24,logoZoneBottom-logoZoneTop),sourceRatio=(logoMeta.width||1)/(logoMeta.height||1),logoWidth=Math.max(24,Math.min(desiredLogoWidth,Math.floor(availableHeight*sourceRatio),logoAreaWidth)),estimatedLogoHeight=Math.ceil(logoWidth/sourceRatio),logoTop=logoZoneTop,logoLeft=Math.round((layout.logoArea?.left??layout.x)+(logoAreaWidth-logoWidth)/2);
  if(layout.x<Math.round(width*.04)||layout.x+layout.width>width-Math.round(width*.04))throw new Error("Marges latérales du lock-up insuffisantes.");
  if(logoLeft<0||logoTop<0||logoLeft+logoWidth>width||logoTop+estimatedLogoHeight>height-minimumBottomMargin)throw new Error("Logo hors cadre.");
  if(titleLines.some(line=>measureVectorText(DISPLAY_FONT,line,titleSize)>safeWidth)||subtitleLines.some(line=>measureVectorText(TEXT_FONT,line,subtitleSize)>safeWidth))throw new Error("Texte hors cadre après mesure typographique.");
  if(type.usedHeight>layout.textArea.bottom-layout.textArea.top)throw new Error("Bloc typographique trop haut pour la zone sûre.");
  if(layout.textArea.bottom>layout.logoArea.top)throw new Error("Collision entre la zone de texte et la zone du logo.");

  const resizedLogo=await sharp(official.buffer,{failOn:"none"}).resize({width:logoWidth,withoutEnlargement:false,fit:"inside"}).png().toBuffer(),resizedLogoMeta=await sharp(resizedLogo).metadata(),finalLogoWidth=resizedLogoMeta.width||logoWidth,finalLogoHeight=resizedLogoMeta.height||estimatedLogoHeight,resizedAudit=await auditLogoTransparency(resizedLogo);
  if(!resizedAudit.integrity)throw new Error("Intégrité du logo perdue pendant le redimensionnement.");
  const brandCenterX=logoLeft+finalLogoWidth/2,logoMedallionWidth=finalLogoWidth,logoBottom=logoTop+finalLogoHeight,brandBaseline=logoBottom+brandTail.brandBaselineOffset,cityBaseline=logoBottom+brandTail.cityBaselineOffset,brandBottom=logoBottom+brandTail.tailHeight;
  if(brandBottom>height-minimumBottomMargin)throw new Error("Lock-up de marque hors cadre.");
  const brandLockup={centerX:brandCenterX,brandSize,citySize,brandBaseline,cityBaseline},normalizedText=value=>String(value||"").trim().replace(/\s+/g," "),titleWidths=titleLines.map(line=>measureVectorText(DISPLAY_FONT,line,titleSize)),subtitleWidths=subtitleLines.map(line=>measureVectorText(TEXT_FONT,line,subtitleSize)),titleTop=textTop,titleBottom=textTop+titleLines.length*titleSize*1.05,subtitleTop=subtitleLines.length?textY-subtitleSize:0,subtitleBottom=subtitleLines.length?textY+(subtitleLines.length-1)*subtitleSize*1.10:0,semanticLinesValid=validateSemanticLines(titleLines,story?4:3)&&validateSemanticLines(subtitleLines,2),logoMedallionWidthRatio=logoMedallionWidth/width,logoScaleValid=logoMedallionWidthRatio>=BRAND_TOKENS.logoMinimumScale-.005&&logoMedallionWidthRatio<=BRAND_TOKENS.logoMaximumScale+.005;
  if(!logoScaleValid)throw new Error(`Logo hors échelle autorisée : ${(logoMedallionWidthRatio*100).toFixed(1)} %.`);
  const compositionManifest=Object.freeze({version:COMPOSITOR_VERSION,platform:normalizedPlatform,premiumBrandLockup:Boolean(premiumLockup),premiumBrandLockupFamily:premiumLockup?.family||"google-legacy",width,height,title,subtitle,titleLines:[...titleLines],subtitleLines:[...subtitleLines],titleSize,subtitleSize,titleWidths,subtitleWidths,textSafeArea:{left:layout.x,top:layout.textArea.top,right:layout.x+layout.width,bottom:layout.textArea.bottom},titleBounds:{left:centerX-Math.max(0,...titleWidths)/2,top:titleTop,right:centerX+Math.max(0,...titleWidths)/2,bottom:titleBottom},subtitleBounds:subtitleLines.length?{left:centerX-Math.max(...subtitleWidths)/2,top:subtitleTop,right:centerX+Math.max(...subtitleWidths)/2,bottom:subtitleBottom}:null,safeWidth,safeHeight:layout.textArea.bottom-layout.textArea.top,usedHeight:type.usedHeight,titleExact:normalizedText(titleLines.join(" "))===normalizedText(title),subtitleExact:normalizedText(subtitleLines.join(" "))===normalizedText(subtitle),textWithinCanvas:[...titleWidths,...subtitleWidths].every(value=>value<=safeWidth)&&type.usedHeight<=layout.textArea.bottom-layout.textArea.top,marginsValid:layout.x>=Math.round(width*.04)&&layout.x+layout.width<=width-Math.round(width*.04),hierarchyValid:!subtitleLines.length||titleSize>subtitleSize,zonesDisjoint:layout.textArea.bottom<=layout.logoArea.top,semanticLinesValid,logoBounds:{left:logoLeft,top:logoTop,width:finalLogoWidth,height:finalLogoHeight,right:logoLeft+finalLogoWidth,bottom:logoTop+finalLogoHeight},completeLogoBounds:{left:logoLeft,top:logoTop,width:finalLogoWidth,height:finalLogoHeight,right:logoLeft+finalLogoWidth,bottom:logoTop+finalLogoHeight},logoWidthRatio:finalLogoWidth/width,logoMedallionWidth,logoMedallionWidthRatio,logoAssetSource:"assets/sdz-logo-compositor.png",logoAssetIntegrity:official.audit.integrity&&resizedAudit.integrity,logoFringeDetected:official.audit.fringeDetected||resizedAudit.fringeDetected,logoScaleValid,brandLockup:{lines:["LA SANTÉ DES ZÈBRES","RAISMES"],contactLines:[],name:"LA SANTÉ DES ZÈBRES",city:"RAISMES",brandSize,citySize,tailHeight:brandTail.tailHeight,top:logoBottom+logoBrandGap,bottom:brandBottom,bottomMargin:height-brandBottom,minimumBottomMargin,centerX:brandCenterX},logoWithinCanvas:logoLeft>=0&&logoTop>=0&&logoLeft+finalLogoWidth<=width&&logoTop+finalLogoHeight<=height-minimumBottomMargin,logoRectangleOpaque:false,completeText:[title,subtitle].filter(Boolean).join(" | ")});
  if(!compositionManifest.titleExact||!compositionManifest.subtitleExact)throw new Error("Texte validé tronqué ou remplacé pendant la composition.");
  if(!compositionManifest.hierarchyValid)throw new Error("Hiérarchie typographique invalide : le sous-titre domine le titre.");
  if(!compositionManifest.semanticLinesValid)throw new Error("Coupure sémantique invalide dans le bloc typographique.");
  if(!compositionManifest.logoAssetIntegrity||compositionManifest.logoFringeDetected)throw new Error("Logo officiel non conforme après composition.");
  const overlaySvg=buildOverlaySvg(width,height,layout,platform,headline,posterStrategy,brandLockup),output=await image.composite([{input:overlaySvg,left:0,top:0},{input:resizedLogo,left:logoLeft,top:logoTop}]).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
  output.compositionManifest=compositionManifest;return output;
}

module.exports={BRAND_TOKENS,COMPOSITOR_VERSION,FONT_PATHS,OFFICIAL_LOGO_PATH,PREMIUM_LOCKUP_BY_PLATFORM,premiumBrandLockupFor,targetPremiumLogoWidth,targetStoryLogoWidth,composeBrandPoster,loadOfficialLogoAsset,auditLogoTransparency,hasOpaqueLogoRectangle,escapeXml,wrapWords,normalizedZone,vectorText,measureVectorText,fitFontSize,fitTypography,validateSemanticLines,computeBrandTailGeometry,layoutFor,BRAND_CONTACTS};
