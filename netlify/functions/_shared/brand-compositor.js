"use strict";

const fs = require("fs");
const sharp = require("sharp");
const opentype = require("opentype.js");
const crypto = require("crypto");
const { PLATFORM_TEMPLATES, normalizePlatform } = require("./v3-layout-engine");
const BRAND_TOKENS=require("./v3-brand-tokens");
const {semanticLines}=require("./v3-creative-strategy");

const GOLD=BRAND_TOKENS.brandGold, PALE_GOLD=BRAND_TOKENS.brandPaleGold, IVORY=BRAND_TOKENS.brandIvory;
const BRAND_CONTACTS = Object.freeze({
  domain:"la-sante-des-zebres.com", phone:"06.84.40.69.54",
  address:"11 cour Dupas, 59590 Raismes", email:"fabien.ducant@gmail.com",
});

/* Netlify n'embarque pas les polices système utilisées par librsvg. Avec un simple <text>
   SVG, les accents français devenaient donc des carrés. Les lettres sont maintenant converties
   en tracés vectoriels à partir d'une police Cinzel embarquée : le rendu est identique sur tous
   les environnements et l'OCR reçoit de vraies lettres lisibles. */
function loadFont(relativeFile){
  const file = require.resolve(`@fontsource/cinzel/files/${relativeFile}`);
  const buffer = fs.readFileSync(file);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return opentype.parse(arrayBuffer);
}

function loadFontSet(weight){
  return {
    latin: loadFont(`cinzel-latin-${weight}-normal.woff`),
    extended: loadFont(`cinzel-latin-ext-${weight}-normal.woff`),
  };
}

const DISPLAY_FONT = loadFontSet(600);
const TEXT_FONT = loadFontSet(400);
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
async function hasOpaqueLogoRectangle(buffer){const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});const inset=Math.max(0,Math.round(Math.min(info.width,info.height)*.02));return [[inset,inset],[info.width-1-inset,inset],[inset,info.height-1-inset],[info.width-1-inset,info.height-1-inset]].every(([x,y])=>{const o=(y*info.width+x)*info.channels;return data[o+3]>245&&Math.max(data[o],data[o+1],data[o+2])<=55;});}

function layoutFor(width, height, platform, requestedZone, hasHeadline, selectedLayout){
  const normalized=normalizePlatform(platform);
  const template=(selectedLayout&&selectedLayout.template)||PLATFORM_TEMPLATES[normalized];
  if(template){
    const spec=template.lockup;
    const margin=Math.max(Math.round(width*.06),Math.round(width*template.margins));
    const story=normalized==="Story";
    const x=Math.max(margin,Math.round(width*spec.x));
    const y=story?Math.round(height*.60):Math.round(height*spec.y);
    const boxWidth=Math.min(Math.round(width*spec.width),width-x-margin);
    const textHeight=Math.round(height*(story?.16:(hasHeadline?.18:.04)));
    const logoHeight=Math.round(height*(story?.10:(height>width?.12:.18)));
    const textTop=y,textBottom=Math.min(height-margin,textTop+textHeight),logoTop=textBottom;
    const result={x,y,width:boxWidth,height:textHeight,margin,portrait:height>width*1.35,landscape:width>height*1.35,template,align:spec.align,textArea:{top:textTop,bottom:textBottom},logoArea:{top:logoTop,bottom:Math.min(height-margin,logoTop+logoHeight)}};
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

function buildOverlaySvg(width, height, layout, platform, headline, posterStrategy){
  const { title, subtitle } = headlineParts(headline);
  const story=normalizePlatform(platform)==="Story";
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2);
  const preferredTitle=Math.round((story?48:(layout.portrait ? 67 : 62))*scale);
  const preferredSubtitle=Math.round((story?32:(layout.portrait ? 42 : 38))*scale);
  const brandSize = Math.round((layout.portrait ? 29 : 27) * scale);
  const citySize = Math.round(15 * scale);
  const textMode=posterStrategy?.textMode||"TEXT_MODE_EDITORIAL";
  const titleLines=posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22);
  const subtitleLines=textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28));
  const titleSize=fitFontSize(DISPLAY_FONT,titleLines,preferredTitle,Math.round(26*scale),safeWidth);
  const subtitleSize=fitFontSize(TEXT_FONT,subtitleLines,preferredSubtitle,Math.round(20*scale),safeWidth);
  const centerX = layout.x + layout.width / 2;
  const plannedLogoWidth = Math.round(layout.width * (layout.portrait ? 0.115 : 0.10));
  const textTop = layout.y + Math.round(layout.height * 0.12);
  let textY = textTop + titleSize;
  const titleNodes = titleLines.map((line, index)=>
    vectorText(DISPLAY_FONT, line, centerX, textY + index * titleSize * 1.05, titleSize, "title")
  ).join("");
  textY += titleLines.length * titleSize * 1.05 + subtitleSize * 0.45;
  const subtitleNodes = subtitleLines.map((line, index)=>
    vectorText(TEXT_FONT, line, centerX, textY + index * subtitleSize * 1.10, subtitleSize, "subtitle")
  ).join("");
  const headlineEnd = textY + Math.max(1, subtitleLines.length) * subtitleSize * 1.10;
  const dividerY = headlineEnd + Math.round(layout.height * 0.055);
  const plannedLogoTop = dividerY + Math.round(layout.height * 0.055);
  const brandY = layout.logoArea ? Math.min(height-Math.round(height*.055),layout.logoArea.bottom+Math.round(brandSize*1.15)) : plannedLogoTop + plannedLogoWidth + Math.round(brandSize * 1.18);
  const scrimTop = Math.max(0, layout.y - Math.round(height * 0.025));
  const scrimBottom = Math.min(height, layout.y + layout.height + Math.round(height * 0.025));
  const border = Math.max(2, Math.round(width * 0.0017));
  const contactFields=(layout.template&&layout.template.contactFields)||[];
  const contactText=contactFields.map(key=>BRAND_CONTACTS[key]).filter(Boolean).join(" · ");
  const contactY=Math.min(height-Math.max(18,Math.round(height*.025)),layout.y+layout.height-Math.round(layout.height*.06));
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#050505" stop-opacity="0.08"/>
          <stop offset="0.24" stop-color="#050505" stop-opacity="0.48"/>
          <stop offset="0.76" stop-color="#050505" stop-opacity="0.58"/>
          <stop offset="1" stop-color="#050505" stop-opacity="0.10"/>
        </linearGradient>
        <filter id="shadow"><feGaussianBlur stdDeviation="5"/></filter>
        <style>
          .brand,.city,.title,.subtitle { paint-order:stroke fill; stroke:#050505; stroke-opacity:.72; }
          .brand { fill:${IVORY}; stroke-width:2px; }
          .city { fill:${GOLD}; stroke-width:1px; }
          .title { fill:${IVORY}; stroke-width:3px; }
          .subtitle { fill:${PALE_GOLD}; stroke-width:2px; }
          .contact { fill:${IVORY}; stroke-width:1px; }
        </style>
      </defs>
      <rect x="0" y="${scrimTop}" width="${width}" height="${scrimBottom-scrimTop}" fill="url(#scrim)"/>
      <rect x="${Math.round(width*.018)}" y="${Math.round(height*.012)}" width="${Math.round(width*.964)}" height="${Math.round(height*.976)}" rx="${Math.round(width*.004)}" fill="none" stroke="${GOLD}" stroke-opacity=".68" stroke-width="${border}"/>
      <line x1="${layout.x + layout.width*.30}" y1="${dividerY}" x2="${layout.x + layout.width*.70}" y2="${dividerY}" stroke="${GOLD}" stroke-width="${border}" stroke-opacity=".82"/>
      ${vectorText(DISPLAY_FONT, "LA SANTÉ DES ZÈBRES", centerX, brandY, brandSize, "brand")}
      ${vectorText(DISPLAY_FONT, "RAISMES", centerX, brandY + brandSize*1.38, citySize, "city")}
      ${vectorText(TEXT_FONT, contactText, centerX, contactY, Math.max(13,Math.round(citySize*.82)), "contact")}
      ${titleNodes}${subtitleNodes}
    </svg>`);
}

async function prepareLogoOverlay(logoBuffer){
  const cacheKey=crypto.createHash("sha256").update(logoBuffer).digest("hex");
  if(TRANSPARENT_LOGO_CACHE.has(cacheKey))return Buffer.from(TRANSPARENT_LOGO_CACHE.get(cacheKey));
  const source = sharp(logoBuffer, { failOn: "none" }).rotate().ensureAlpha();
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  /* Détourage conservateur par composante connexe : seuls les pixels quasi noirs accessibles
     depuis un bord deviennent transparents. Les noirs internes fermés du zèbre restent intacts. */
  const seen=new Uint8Array(info.width*info.height);const queue=[];const dark=(x,y)=>{const o=(y*info.width+x)*info.channels;return px[o+3]>0&&Math.max(px[o],px[o+1],px[o+2])<=55;};
  const seed=(x,y)=>{const i=y*info.width+x;if(!seen[i]&&dark(x,y)){seen[i]=1;queue.push([x,y]);}};
  for(let x=0;x<info.width;x++){seed(x,0);seed(x,info.height-1);}for(let y=0;y<info.height;y++){seed(0,y);seed(info.width-1,y);}
  for(let q=0;q<queue.length;q++){const [x,y]=queue[q];const o=(y*info.width+x)*info.channels;px[o+3]=0;for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&ny>=0&&nx<info.width&&ny<info.height)seed(nx,ny);}
  const output=await sharp(px, { raw: info })
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
  const layout = layoutFor(width, height, platform, zoneText, hasHeadline, selectedLayout);
  const { title, subtitle } = headlineParts(headline);
  const story=normalizePlatform(platform)==="Story";
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const titleLines = posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22);
  const subtitleLines = textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28));
  const safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2);
  const titleSize=fitFontSize(DISPLAY_FONT,titleLines,Math.round((story?48:(layout.portrait?67:62))*scale),Math.round(26*scale),safeWidth);
  const subtitleSize=fitFontSize(TEXT_FONT,subtitleLines,Math.round((story?32:(layout.portrait?42:38))*scale),Math.round(20*scale),safeWidth);
  const textTop = layout.y + Math.round(layout.height * 0.12);
  const textY = textTop + titleSize + titleLines.length * titleSize * 1.05 + subtitleSize * 0.45;
  const headlineEnd = textY + Math.max(1, subtitleLines.length) * subtitleSize * 1.10;
  const dividerY = headlineEnd + Math.round(layout.height * 0.055);
  const cleanLogo = await prepareLogoOverlay(logoBuffer);
  const logoMeta = await sharp(cleanLogo).metadata();
  const logoFraction=posterStrategy?.logoScale==="discreet"?.12:posterStrategy?.logoScale==="standard"?.16:.21;
  const desiredLogoWidth = Math.round(layout.width * logoFraction);
  const minimumBottomMargin = Math.max(Math.round(height*.035), 24);
  const logoZoneTop=layout.logoArea?.top??Math.round(dividerY + layout.height*.055);
  const logoZoneBottom=layout.logoArea?.bottom??(height-minimumBottomMargin);
  const availableHeight = Math.max(24, logoZoneBottom-logoZoneTop);
  const sourceRatio = (logoMeta.width||1)/(logoMeta.height||1);
  const logoWidth = Math.max(24, Math.min(desiredLogoWidth, Math.floor(availableHeight*sourceRatio)));
  const logoTop = Math.max(logoZoneTop,Math.min(logoZoneBottom-Math.ceil(logoWidth/sourceRatio),logoZoneTop));
  const logoLeft = Math.round(layout.x + (layout.width - logoWidth) / 2);
  const estimatedLogoHeight=Math.ceil(logoWidth/sourceRatio);
  if(layout.x<Math.round(width*.06)||layout.x+layout.width>width-Math.round(width*.06))throw new Error("Marges latérales du lock-up insuffisantes.");
  if(logoLeft<0||logoTop<0||logoLeft+logoWidth>width||logoTop+estimatedLogoHeight>height-minimumBottomMargin)throw new Error("Logo hors cadre.");
  if(titleLines.some(line=>measureVectorText(DISPLAY_FONT,line,titleSize)>safeWidth)||subtitleLines.some(line=>measureVectorText(TEXT_FONT,line,subtitleSize)>safeWidth))throw new Error("Texte hors cadre après mesure typographique.");
  const resizedLogo = await sharp(cleanLogo, { failOn: "none" })
    .resize({ width: logoWidth, withoutEnlargement: false, fit: "inside" })
    .png().toBuffer();
  if(await hasOpaqueLogoRectangle(resizedLogo))throw new Error("Rectangle opaque détecté autour du logo officiel.");
  const overlaySvg = buildOverlaySvg(width, height, layout, platform, headline, posterStrategy);
  return image
    .composite([
      { input: overlaySvg, left: 0, top: 0 },
      { input: resizedLogo, left: logoLeft, top: logoTop },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

module.exports = { BRAND_TOKENS, composeBrandPoster, dataUrlToBuffer, escapeXml, wrapWords, normalizedZone, prepareLogoOverlay, hasOpaqueLogoRectangle,vectorText, measureVectorText,fitFontSize,layoutFor, BRAND_CONTACTS };
