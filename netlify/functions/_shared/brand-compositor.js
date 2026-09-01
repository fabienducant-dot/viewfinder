"use strict";

const fs = require("fs");
const sharp = require("sharp");
const opentype = require("opentype.js");
const crypto = require("crypto");
const { PLATFORM_TEMPLATES, normalizePlatform } = require("./v3-layout-engine");
const BRAND_TOKENS=require("./v3-brand-tokens");
const {semanticLines}=require("./v3-creative-strategy");

const GOLD=BRAND_TOKENS.brandGold, PALE_GOLD=BRAND_TOKENS.brandPaleGold, IVORY=BRAND_TOKENS.brandIvory;
const COMPOSITOR_VERSION="2.2.2-precise-emblem-silhouette";
const BRAND_CONTACTS = Object.freeze({
  domain:"la-sante-des-zebres.com", phone:"06.84.40.69.54",
  address:"11 cour Dupas, 59590 Raismes", email:"fabien.ducant@gmail.com",
});

/* Ces six chemins doivent rester statiques : esbuild peut ainsi tracer chaque WOFF jusque dans
   l'archive Lambda, sans police système ni résolution de package construite à l'exécution. */
const DISPLAY_LATIN_PATH=require.resolve("@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff");
const DISPLAY_EXTENDED_PATH=require.resolve("@fontsource/cormorant-garamond/files/cormorant-garamond-latin-ext-600-normal.woff");
const TEXT_LATIN_PATH=require.resolve("@fontsource/manrope/files/manrope-latin-500-normal.woff");
const TEXT_EXTENDED_PATH=require.resolve("@fontsource/manrope/files/manrope-latin-ext-500-normal.woff");
const BRAND_LATIN_PATH=require.resolve("@fontsource/manrope/files/manrope-latin-600-normal.woff");
const BRAND_EXTENDED_PATH=require.resolve("@fontsource/manrope/files/manrope-latin-ext-600-normal.woff");
const FONT_PATHS=Object.freeze({
  displayLatin:DISPLAY_LATIN_PATH,displayExtended:DISPLAY_EXTENDED_PATH,
  textLatin:TEXT_LATIN_PATH,textExtended:TEXT_EXTENDED_PATH,
  brandLatin:BRAND_LATIN_PATH,brandExtended:BRAND_EXTENDED_PATH,
});

function loadFont(file){
  const buffer = fs.readFileSync(file);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return opentype.parse(arrayBuffer);
}

function loadFontSet(latinPath, extendedPath){
  return {latin:loadFont(latinPath),extended:loadFont(extendedPath)};
}

const DISPLAY_FONT=loadFontSet(DISPLAY_LATIN_PATH,DISPLAY_EXTENDED_PATH);
const TEXT_FONT=loadFontSet(TEXT_LATIN_PATH,TEXT_EXTENDED_PATH);
const BRAND_FONT=loadFontSet(BRAND_LATIN_PATH,BRAND_EXTENDED_PATH);
// Le trim se cale sur les bords horizontaux de l'ellipse : la largeur finale
// du raster détouré est donc le diamètre visuel du médaillon.
const MEDALLION_DIAMETER_RATIO=1;
const TRANSPARENT_LOGO_CACHE = new Map();

function dataUrlToBuffer(dataUrl){
  const match = String(dataUrl || "").match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if(!match) throw new Error("Logo officiel invalide dans Netlify Blobs.");
  return Buffer.from(match[1], "base64");
}

function escapeXml(value){
  return String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function normalizedZone(value, platform){
  const raw = String(value || "").toLowerCase();
  if(/sup|haut|top/.test(raw)) return "top";
  if(/centre|milieu|center/.test(raw)) return "center";
  if(/inf|bas|bottom/.test(raw)) return "bottom";
  return platform === "Story" ? "top" : "bottom";
}

function wrapWords(text, maxChars, maxLines){
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for(const word of words){
    const candidate = line ? `${line} ${word}` : word;
    if(candidate.length <= maxChars || !line){
      line = candidate;
    }else{
      lines.push(line);
      line = word;
      if(lines.length === maxLines - 1) break;
    }
  }
  if(line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(" ").split(/\s+/).length;
  if(consumed < words.length && lines.length){
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, "")}…`;
  }
  return lines;
}

function headlineParts(headline){
  const parts = String(headline || "").split("|").map(v=>v.trim()).filter(Boolean);
  return { title: parts[0] || "", subtitle: parts.slice(1).join(" — ") };
}

function vectorText(fontSet, text, centerX, baselineY, fontSize, className){
  const value = String(text || "");
  if(!value) return "";
  const runs = Array.from(value).map(character=>{
    const latinGlyph = fontSet.latin.charToGlyph(character);
    const useExtended = latinGlyph.index === 0 && character !== "\0";
    const font = useExtended ? fontSet.extended : fontSet.latin;
    const glyph = useExtended ? font.charToGlyph(character) : latinGlyph;
    return { font, glyph };
  });
  const advances = runs.map(({font,glyph})=>(glyph.advanceWidth || font.unitsPerEm*.38) * fontSize / font.unitsPerEm);
  const width = advances.reduce((sum, advance)=>sum+advance, 0);
  let x = centerX - width / 2;
  const paths = runs.map(({glyph}, index)=>{
    const node = glyph.getPath(x, baselineY, fontSize).toPathData(2);
    x += advances[index];
    return node;
  }).join("");
  return `<path d="${paths}" class="${className}"/>`;
}

function measureVectorText(fontSet,text,fontSize,letterSpacing=0){
  const chars=Array.from(String(text||""));
  return chars.reduce((sum,character)=>{const latin=fontSet.latin.charToGlyph(character);const font=latin.index===0&&character!=="\0"?fontSet.extended:fontSet.latin;const glyph=font.charToGlyph(character);return sum+(glyph.advanceWidth||font.unitsPerEm*.38)*fontSize/font.unitsPerEm;},0)+Math.max(0,chars.length-1)*letterSpacing;
}
function fitFontSize(fontSet,lines,preferred,minimum,safeWidth){let size=preferred;while(size>minimum&&lines.some(line=>measureVectorText(fontSet,line,size)>safeWidth))size--;return size;}
function fitTypography({titleLines,subtitleLines,safeWidth,safeHeight,preferredTitle,preferredSubtitle,minimumTitle,minimumSubtitle}){
  let titleSize=fitFontSize(DISPLAY_FONT,titleLines,preferredTitle,minimumTitle,safeWidth);
  let subtitleSize=fitFontSize(TEXT_FONT,subtitleLines,preferredSubtitle,minimumSubtitle,safeWidth);
  const usedHeight=()=>titleLines.length*titleSize*1.08+(subtitleLines.length?subtitleSize*.55+subtitleLines.length*subtitleSize*1.12:0);
  while(usedHeight()>safeHeight&&(titleSize>minimumTitle||subtitleSize>minimumSubtitle)){
    if(titleSize>minimumTitle)titleSize--;
    if(subtitleSize>minimumSubtitle)subtitleSize--;
  }
  return {titleSize,subtitleSize,usedHeight:usedHeight()};
}
function validateSemanticLines(lines, maximum){
  const weak=new Set(["À","AU","AUX","DE","DES","DU","ET","LE","LA","LES","OU","UN","UNE"]);
  return lines.length<=maximum&&lines.every(line=>String(line).trim()&&!weak.has(String(line).trim().toUpperCase()));
}
function targetStoryLogoWidth(width){return Math.round(Number(width)*.33);}
function computeBrandTailGeometry({logoBrandGap,brandSize,citySize}){
  const brandBaselineOffset=logoBrandGap+brandSize;
  const cityBaselineOffset=brandBaselineOffset+brandSize*1.28;
  const tailHeight=cityBaselineOffset+Math.round(citySize*.18);
  return Object.freeze({brandBaselineOffset,cityBaselineOffset,tailHeight});
}
async function hasOpaqueLogoRectangle(buffer){const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});const inset=Math.max(0,Math.round(Math.min(info.width,info.height)*.02));return [[inset,inset],[info.width-1-inset,inset],[inset,info.height-1-inset],[info.width-1-inset,info.height-1-inset]].every(([x,y])=>{const o=(y*info.width+x)*info.channels;return data[o+3]>245&&Math.max(data[o],data[o+1],data[o+2])<=55;});}

function layoutFor(width, height, platform, requestedZone, hasHeadline, selectedLayout, posterStrategy){
  const normalized=normalizePlatform(platform);
  const template=(selectedLayout&&selectedLayout.template)||PLATFORM_TEMPLATES[normalized];
  if(template){
    const spec=template.lockup;
    const margin=Math.max(Math.round(width*.06),Math.round(width*template.margins));
    const textSafe=posterStrategy?.textSafeArea;
    const logoSafe=posterStrategy?.logoSafeArea;
    const x=textSafe?Math.max(margin,Math.round(width*textSafe.left)):Math.max(margin,Math.round(width*spec.x));
    let y=textSafe?Math.max(margin,Math.round(height*textSafe.top)):Math.max(margin,Math.round(height*spec.y));
    const boxWidth=textSafe?Math.min(Math.round(width*(textSafe.right-textSafe.left)),width-x-margin):Math.min(Math.round(width*spec.width),width-x-margin);
    let textBottom=textSafe?Math.round(height*textSafe.bottom):Math.min(height-margin,y+Math.round(height*(hasHeadline?.18:.04)));
    if(normalized==="Story"){
      if(!textSafe)y=Math.round(height*.60);
      textBottom=Math.min(textBottom,Math.round(height*.70));
    }
    const logoArea=logoSafe?{left:Math.round(width*logoSafe.left),right:Math.round(width*logoSafe.right),top:Math.round(height*logoSafe.top),bottom:Math.round(height*logoSafe.bottom)}:{left:x,right:x+boxWidth,top:textBottom,bottom:Math.min(height-margin,textBottom+Math.round(height*(height>width?.12:.18)))};
    if(normalized==="Story"){
      logoArea.left=Math.round(width*.18);logoArea.right=Math.round(width*.82);
      logoArea.top=textBottom+Math.round(height*.006);
      logoArea.bottom=Math.min(height-margin,height-Math.max(24,Math.round(height*.035)));
    }
    const result={x,y,width:boxWidth,height:Math.max(1,textBottom-y),margin,portrait:height>width*1.35,landscape:width>height*1.35,template,align:spec.align,textArea:{top:y,bottom:textBottom},logoArea};
    return result;
  }
  /* L'identité et l'accroche forment un cartouche éditorial unique en bas de l'image. L'ancien
     empilement en haut traversait régulièrement le visage et serrait la signature contre le logo. */
  const zone = hasHeadline && ["Instagram","Facebook","Story"].includes(platform)
    ? "bottom"
    : normalizedZone(requestedZone, platform);
  const portrait = height > width * 1.35;
  const landscape = width > height * 1.35;
  const margin = Math.round(width * (portrait ? 0.065 : 0.052));
  const boxW = landscape ? Math.round(width * 0.56) : width - margin * 2;
  const boxH = Math.round(height * (hasHeadline ? (portrait ? 0.32 : 0.38) : 0.23));
  const x = landscape ? margin : margin;
  let y;
  if(zone === "top") y = Math.round(height * 0.055);
  else if(zone === "center") y = Math.round((height - boxH) * 0.50);
  else y = height - boxH - Math.round(height * (portrait ? 0.035 : 0.045));
  return { x, y, width: boxW, height: boxH, margin, portrait, landscape };
}

function buildOverlaySvg(width, height, layout, platform, headline, posterStrategy,brandLockup){
  const { title, subtitle } = headlineParts(headline);
  const story=normalizePlatform(platform)==="Story";
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2);
  const preferredTitle=Math.round((story?48:(layout.portrait ? 67 : 62))*scale);
  const preferredSubtitle=Math.round((story?32:(layout.portrait ? 42 : 38))*scale);
  const brandSize=brandLockup.brandSize;
  const citySize=brandLockup.citySize;
  const textMode=posterStrategy?.textMode||"TEXT_MODE_EDITORIAL";
  const titleLines=posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22);
  const subtitleLines=textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28));
  const type=fitTypography({titleLines,subtitleLines,safeWidth,safeHeight:Math.max(1,layout.textArea.bottom-layout.textArea.top-Math.round(height*.018)),preferredTitle,preferredSubtitle,minimumTitle:Math.round(24*scale),minimumSubtitle:Math.round(18*scale)});
  const titleSize=type.titleSize,subtitleSize=type.subtitleSize;
  const centerX = layout.x + layout.width / 2;
  const logoCenterX=brandLockup.centerX;
  const textTop = layout.textArea.top + Math.round((layout.textArea.bottom-layout.textArea.top) * 0.08);
  let textY = textTop + titleSize;
  const titleNodes = titleLines.map((line, index)=>
    vectorText(DISPLAY_FONT, line, centerX, textY + index * titleSize * 1.05, titleSize, "title")
  ).join("");
  textY += titleLines.length * titleSize * 1.05 + subtitleSize * 0.45;
  const subtitleNodes = subtitleLines.map((line, index)=>
    vectorText(TEXT_FONT, line, centerX, textY + index * subtitleSize * 1.10, subtitleSize, "subtitle")
  ).join("");
  const headlineEnd = subtitleLines.length?textY+subtitleLines.length*subtitleSize*1.10:textY;
  const dividerY = Math.min(layout.textArea.bottom-Math.round(height*.008),headlineEnd+Math.round(height*.012));
  const brandY=brandLockup.brandBaseline;
  const scrimTop = Math.max(0, layout.y - Math.round(height * 0.025));
  const scrimBottom = Math.min(height, layout.y + layout.height + Math.round(height * 0.025));
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#050505" stop-opacity="0"/>
          <stop offset="0.28" stop-color="#050505" stop-opacity="0.22"/>
          <stop offset="0.72" stop-color="#050505" stop-opacity="0.34"/>
          <stop offset="1" stop-color="#050505" stop-opacity="0"/>
        </linearGradient>
        <filter id="shadow"><feGaussianBlur stdDeviation="5"/></filter>
        <style>
          .brand,.city,.title,.subtitle { paint-order:stroke fill; stroke:#050505; stroke-opacity:.72; }
          .brand { fill:${GOLD}; stroke-width:2px; }
          .city { fill:${GOLD}; stroke-width:1px; }
          .title { fill:${IVORY}; stroke-width:3px; }
          .subtitle { fill:${PALE_GOLD}; stroke-width:2px; }
        </style>
      </defs>
      <rect x="0" y="${scrimTop}" width="${width}" height="${scrimBottom-scrimTop}" fill="url(#scrim)"/>
      <line x1="${layout.x + layout.width*.38}" y1="${dividerY}" x2="${layout.x + layout.width*.62}" y2="${dividerY}" stroke="${GOLD}" stroke-width="1" stroke-opacity=".46"/>
      ${vectorText(BRAND_FONT, "LA SANTÉ DES ZÈBRES", logoCenterX, brandY, brandSize, "brand")}
      ${vectorText(TEXT_FONT, "RAISMES", logoCenterX, brandLockup.cityBaseline, citySize, "city")}
      ${titleNodes}${subtitleNodes}
    </svg>`);
}

async function normalizeLogoRaster(logoBuffer){
  return sharp(logoBuffer,{failOn:"none"}).rotate().ensureAlpha().png().toBuffer();
}

function buildLogoSilhouetteMask(width,height){
  /* Silhouette géométrique complète, indépendante des couleurs : médaillon, triangle
     supérieur et volute dorée qui s'échappe vers le bas/droite. */
  const ribbonStroke=Math.max(1,Math.min(width,height)*.045);
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${width*.5}" cy="${height*.53}" rx="${width*.49}" ry="${height*.46}" fill="white"/>
    <path d="M ${width*.32} ${height*.12} L ${width*.5} 0 L ${width*.68} ${height*.12} Z" fill="white"/>
    <path d="M ${width*.70} ${height*.76} C ${width*.82} ${height*.77}, ${width*.94} ${height*.84}, ${width*.96} ${height*.90} C ${width*.91} ${height*.91}, ${width*.86} ${height*.96}, ${width*.84} ${height*.995}" fill="none" stroke="white" stroke-width="${ribbonStroke}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
}

async function prepareLogoOverlay(logoBuffer){
  const cacheKey=crypto.createHash("sha256").update(logoBuffer).digest("hex");
  if(TRANSPARENT_LOGO_CACHE.has(cacheKey))return Buffer.from(TRANSPARENT_LOGO_CACHE.get(cacheKey));
  const normalizedLogo=await normalizeLogoRaster(logoBuffer);
  const info=await sharp(normalizedLogo).metadata();
  if(!info.width||!info.height)throw new Error("Dimensions du logo officiel introuvables.");
  const mask=buildLogoSilhouetteMask(info.width,info.height);
  const output=await sharp(normalizedLogo)
    .composite([{input:mask,blend:"dest-in"}])
    .trim({ background: { r:0, g:0, b:0, alpha:0 } })
    .png()
    .toBuffer();
  TRANSPARENT_LOGO_CACHE.set(cacheKey,Buffer.from(output));return output;
}

async function composeBrandPoster({ imageBuffer, logoDataUrl, platform, headline, zoneText, selectedLayout, posterStrategy }){
  if(!imageBuffer || !Buffer.isBuffer(imageBuffer)) throw new Error("Image générée absente du compositeur.");
  const logoBuffer = dataUrlToBuffer(logoDataUrl);
  const template=(selectedLayout&&selectedLayout.template)||PLATFORM_TEMPLATES[normalizePlatform(platform)];
  const sourceImage=sharp(imageBuffer,{failOn:"none"}).rotate();
  const image=template?sourceImage.resize({width:template.width,height:template.height,fit:"cover",position:selectedLayout?.cropPosition||"attention"}):sourceImage;
  const meta = await sourceImage.metadata();
  const width = template?.width || meta.width;
  const height = template?.height || meta.height;
  if(!width || !height) throw new Error("Dimensions de l'image générée introuvables.");
  const textMode=posterStrategy?.textMode||"TEXT_MODE_EDITORIAL";
  if(textMode==="TEXT_MODE_NONE")headline="";else if(posterStrategy){const subtitle=textMode==="TEXT_MODE_MINIMAL"?"":posterStrategy.subtitle;headline=[posterStrategy.title,subtitle].filter(Boolean).join(" | ");}
  const hasHeadline = Boolean(String(headline || "").trim());
  const layout = layoutFor(width, height, platform, zoneText, hasHeadline, selectedLayout,posterStrategy);
  const { title, subtitle } = headlineParts(headline);
  const story=normalizePlatform(platform)==="Story";
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const titleLines = posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22);
  const subtitleLines = textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28));
  const safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2);
  const type=fitTypography({titleLines,subtitleLines,safeWidth,safeHeight:Math.max(1,layout.textArea.bottom-layout.textArea.top-Math.round(height*.018)),preferredTitle:Math.round((story?48:(layout.portrait?67:62))*scale),preferredSubtitle:Math.round((story?32:(layout.portrait?42:38))*scale),minimumTitle:Math.round(24*scale),minimumSubtitle:Math.round(18*scale)});
  const titleSize=type.titleSize,subtitleSize=type.subtitleSize;
  const centerX=layout.x+layout.width/2;
  const textTop = layout.textArea.top + Math.round((layout.textArea.bottom-layout.textArea.top) * 0.08);
  const textY = textTop + titleSize + titleLines.length * titleSize * 1.05 + subtitleSize * 0.45;
  const headlineEnd = textY + Math.max(1, subtitleLines.length) * subtitleSize * 1.10;
  const dividerY = headlineEnd + Math.round(layout.height * 0.055);
  const cleanLogo = await prepareLogoOverlay(logoBuffer);
  const logoMeta = await sharp(cleanLogo).metadata();
  const logoFraction=posterStrategy?.logoScale==="discreet"?.12:posterStrategy?.logoScale==="standard"?.16:.21;
  const logoAreaWidth=(layout.logoArea?.right-layout.logoArea?.left)||layout.width;
  const desiredLogoWidth=story?targetStoryLogoWidth(width):Math.round(logoAreaWidth*logoFraction/.21);
  const brandSize=Math.round((story?50:(layout.portrait?29:27))*scale);
  const citySize=Math.round((story?30:15)*scale);
  const logoBrandGap=Math.max(8,Math.round(height*.006));
  const brandTail=computeBrandTailGeometry({logoBrandGap,brandSize,citySize});
  const minimumBottomMargin = Math.max(Math.round(height*.035), 24);
  const logoZoneTop=layout.logoArea?.top??Math.round(dividerY + layout.height*.055);
  const logoZoneBottom=(layout.logoArea?.bottom??(height-minimumBottomMargin))-brandTail.tailHeight;
  const availableHeight = Math.max(24, logoZoneBottom-logoZoneTop);
  const sourceRatio = (logoMeta.width||1)/(logoMeta.height||1);
  const logoWidth = Math.max(24, Math.min(desiredLogoWidth, Math.floor(availableHeight*sourceRatio)));
  const logoTop = Math.max(logoZoneTop,Math.min(logoZoneBottom-Math.ceil(logoWidth/sourceRatio),logoZoneTop));
  const logoLeft = Math.round((layout.logoArea?.left??layout.x) + (logoAreaWidth - logoWidth) / 2);
  const estimatedLogoHeight=Math.ceil(logoWidth/sourceRatio);
  if(layout.x<Math.round(width*.04)||layout.x+layout.width>width-Math.round(width*.04))throw new Error("Marges latérales du lock-up insuffisantes.");
  if(logoLeft<0||logoTop<0||logoLeft+logoWidth>width||logoTop+estimatedLogoHeight>height-minimumBottomMargin)throw new Error("Logo hors cadre.");
  if(titleLines.some(line=>measureVectorText(DISPLAY_FONT,line,titleSize)>safeWidth)||subtitleLines.some(line=>measureVectorText(TEXT_FONT,line,subtitleSize)>safeWidth))throw new Error("Texte hors cadre après mesure typographique.");
  if(type.usedHeight>layout.textArea.bottom-layout.textArea.top)throw new Error("Bloc typographique trop haut pour la zone sûre.");
  if(layout.textArea.bottom>layout.logoArea.top)throw new Error("Collision entre la zone de texte et la zone du logo.");
  const resizedLogo = await sharp(cleanLogo, { failOn: "none" })
    .resize({ width: logoWidth, withoutEnlargement: false, fit: "inside" })
    .png().toBuffer();
  const resizedLogoMeta=await sharp(resizedLogo).metadata();
  const finalLogoWidth=resizedLogoMeta.width||logoWidth,finalLogoHeight=resizedLogoMeta.height||estimatedLogoHeight;
  if(await hasOpaqueLogoRectangle(resizedLogo))throw new Error("Rectangle opaque détecté autour du logo officiel.");
  const brandCenterX=logoLeft+finalLogoWidth/2;
  const logoMedallionWidth=finalLogoWidth*MEDALLION_DIAMETER_RATIO;
  const logoBottom=logoTop+finalLogoHeight;
  const brandBaseline=logoBottom+brandTail.brandBaselineOffset;
  const cityBaseline=logoBottom+brandTail.cityBaselineOffset;
  const brandBottom=logoBottom+brandTail.tailHeight;
  if(brandBottom>height-minimumBottomMargin)throw new Error("Lock-up de marque hors cadre.");
  const brandLockup={centerX:brandCenterX,brandSize,citySize,brandBaseline,cityBaseline};
  const normalizedText=value=>String(value||"").trim().replace(/\s+/g," ");
  const titleWidths=titleLines.map(line=>measureVectorText(DISPLAY_FONT,line,titleSize));
  const subtitleWidths=subtitleLines.map(line=>measureVectorText(TEXT_FONT,line,subtitleSize));
  const titleTop=textTop,titleBottom=textTop+titleLines.length*titleSize*1.05;
  const subtitleTop=subtitleLines.length?textY-subtitleSize:0;
  const subtitleBottom=subtitleLines.length?textY+(subtitleLines.length-1)*subtitleSize*1.10:0;
  const semanticLinesValid=validateSemanticLines(titleLines,story?4:3)&&validateSemanticLines(subtitleLines,2);
  const compositionManifest=Object.freeze({
    version:COMPOSITOR_VERSION,
    platform:normalizePlatform(platform),
    width,height,
    title,subtitle,
    titleLines:[...titleLines],subtitleLines:[...subtitleLines],
    titleSize,subtitleSize,
    titleWidths,subtitleWidths,
    textSafeArea:{left:layout.x,top:layout.textArea.top,right:layout.x+layout.width,bottom:layout.textArea.bottom},
    titleBounds:{left:centerX-Math.max(0,...titleWidths)/2,top:titleTop,right:centerX+Math.max(0,...titleWidths)/2,bottom:titleBottom},
    subtitleBounds:subtitleLines.length?{left:centerX-Math.max(...subtitleWidths)/2,top:subtitleTop,right:centerX+Math.max(...subtitleWidths)/2,bottom:subtitleBottom}:null,
    safeWidth,safeHeight:layout.textArea.bottom-layout.textArea.top,
    usedHeight:type.usedHeight,
    titleExact:normalizedText(titleLines.join(" "))===normalizedText(title),
    subtitleExact:normalizedText(subtitleLines.join(" "))===normalizedText(subtitle),
    textWithinCanvas:[...titleWidths,...subtitleWidths].every(value=>value<=safeWidth)&&type.usedHeight<=layout.textArea.bottom-layout.textArea.top,
    marginsValid:layout.x>=Math.round(width*.04)&&layout.x+layout.width<=width-Math.round(width*.04),
    hierarchyValid:!subtitleLines.length||titleSize>subtitleSize,
    zonesDisjoint:layout.textArea.bottom<=layout.logoArea.top,
    semanticLinesValid,
    logoBounds:{left:logoLeft,top:logoTop,width:finalLogoWidth,height:finalLogoHeight,right:logoLeft+finalLogoWidth,bottom:logoTop+finalLogoHeight},
    completeLogoBounds:{left:logoLeft,top:logoTop,width:finalLogoWidth,height:finalLogoHeight,right:logoLeft+finalLogoWidth,bottom:logoTop+finalLogoHeight},
    logoWidthRatio:finalLogoWidth/width,
    logoMedallionWidth,logoMedallionWidthRatio:logoMedallionWidth/width,
    brandLockup:{lines:["LA SANTÉ DES ZÈBRES","RAISMES"],contactLines:[],name:"LA SANTÉ DES ZÈBRES",city:"RAISMES",brandSize,citySize,tailHeight:brandTail.tailHeight,top:logoBottom+logoBrandGap,bottom:brandBottom,bottomMargin:height-brandBottom,minimumBottomMargin,centerX:brandCenterX},
    logoWithinCanvas:logoLeft>=0&&logoTop>=0&&logoLeft+finalLogoWidth<=width&&logoTop+finalLogoHeight<=height-minimumBottomMargin,
    logoRectangleOpaque:false,
    completeText:[title,subtitle].filter(Boolean).join(" | "),
  });
  if(!compositionManifest.titleExact||!compositionManifest.subtitleExact)throw new Error("Texte validé tronqué ou remplacé pendant la composition.");
  if(!compositionManifest.hierarchyValid)throw new Error("Hiérarchie typographique invalide : le sous-titre domine le titre.");
  if(!compositionManifest.semanticLinesValid)throw new Error("Coupure sémantique invalide dans le bloc typographique.");
  const overlaySvg = buildOverlaySvg(width, height, layout, platform, headline, posterStrategy,brandLockup);
  const output=await image
    .composite([
      { input: overlaySvg, left: 0, top: 0 },
      { input: resizedLogo, left: logoLeft, top: logoTop },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  output.compositionManifest=compositionManifest;
  return output;
}

module.exports = { BRAND_TOKENS, COMPOSITOR_VERSION, FONT_PATHS, composeBrandPoster, dataUrlToBuffer, escapeXml, wrapWords, normalizedZone, normalizeLogoRaster,buildLogoSilhouetteMask,prepareLogoOverlay,hasOpaqueLogoRectangle,vectorText,measureVectorText,fitFontSize,fitTypography,validateSemanticLines,targetStoryLogoWidth,computeBrandTailGeometry,layoutFor,BRAND_CONTACTS };
