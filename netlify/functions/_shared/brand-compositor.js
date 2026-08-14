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
function fitFontSize(fontSet,lines,preferred,minimum,safeWidth,safeHeight=Infinity,lineHeight=1.1){let size=preferred;while(size>minimum&&(lines.some(line=>measureVectorText(fontSet,line,size)>safeWidth)||lines.length*size*lineHeight>safeHeight))size--;return size;}
async function hasOpaqueLogoRectangle(buffer){const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});const inset=Math.max(0,Math.round(Math.min(info.width,info.height)*.02));return [[inset,inset],[info.width-1-inset,inset],[inset,info.height-1-inset],[info.width-1-inset,info.height-1-inset]].every(([x,y])=>{const o=(y*info.width+x)*info.channels;return data[o+3]>245&&Math.max(data[o],data[o+1],data[o+2])<=55;});}

function normalizedBox(box,width,height,fallback){
  if(!box)return fallback;
  const values={left:Number(box.left),right:Number(box.right),top:Number(box.top),bottom:Number(box.bottom)};
  if(Object.values(values).some(value=>!Number.isFinite(value)))return fallback;
  const normalized=Math.max(...Object.values(values))<=1;
  const result={left:Math.round(values.left*(normalized?width:1)),right:Math.round(values.right*(normalized?width:1)),top:Math.round(values.top*(normalized?height:1)),bottom:Math.round(values.bottom*(normalized?height:1))};
  if(result.left<0||result.top<0||result.right>width||result.bottom>height||result.right<=result.left||result.bottom<=result.top)throw new Error("Zone V3 invalide ou hors canvas.");
  return result;
}
function resolveSafeAreas(platform,posterStrategy,width,height){
  const normalized=normalizePlatform(platform),defaults=BRAND_TOKENS.compositionSafeAreas[normalized];
  if(!defaults)throw new Error(`Zones de composition absentes pour ${normalized}.`);
  const custom=posterStrategy?.safeAreasByFormat?.[normalized];
  return {text:normalizedBox(custom?.text,width,height,normalizedBox(defaults.text,width,height,defaults.text)),logo:normalizedBox(custom?.logo,width,height,normalizedBox(defaults.logo,width,height,defaults.logo)),source:custom?"posterStrategy.safeAreasByFormat":"brandTokens.formatDefault"};
}

function layoutFor(width, height, platform, requestedZone, hasHeadline, selectedLayout,posterStrategy){
  const normalized=normalizePlatform(platform);
  const template=(selectedLayout&&selectedLayout.template)||PLATFORM_TEMPLATES[normalized];
  if(template){
    const spec=template.lockup;
    const margin=Math.round(width*template.margins);
    const story=normalized==="Story";
    const x=Math.max(margin,Math.round(width*spec.x));
    const y=story?Math.round(height*.60):Math.round(height*spec.y);
    const boxWidth=Math.min(Math.round(width*spec.width),width-x-margin);
    const textHeight=Math.round(height*(story?.16:(hasHeadline?.18:.04)));
    const logoHeight=Math.round(height*(story?.10:(height>width?.12:.18)));
    const textTop=y,textBottom=Math.min(height-margin,textTop+textHeight),logoTop=textBottom;
    const areas=resolveSafeAreas(normalized,posterStrategy,width,height),textBox=areas.text,logoBox=areas.logo;
    if(textBox.bottom>logoBox.top)throw new Error("Collision entre textSafeArea et logoSafeArea.");
    const result={x:textBox.left,y:textBox.top,width:textBox.right-textBox.left,height:textBox.bottom-textBox.top,margin,portrait:height>width*1.35,landscape:width>height*1.35,template,align:spec.align,safeAreaSource:areas.source,textArea:textBox,logoArea:logoBox};
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

function buildOverlaySvg(width, height, layout, platform, headline, posterStrategy,metrics){
  const { title, subtitle } = headlineParts(headline);
  const story=normalizePlatform(platform)==="Story";
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const safeWidth=Math.min(layout.width,width-Math.max(layout.margin,Math.round(width*.06))*2);
  const preferredTitle=metrics?.titleFontSize||Math.round((story?48:(layout.portrait ? 67 : 62))*scale);
  const preferredSubtitle=metrics?.subtitleFontSize||Math.round((story?32:(layout.portrait ? 42 : 38))*scale);
  const brandSize = Math.round((layout.portrait ? 29 : 27) * scale);
  const citySize = Math.round(15 * scale);
  const textMode=posterStrategy?.textMode||"TEXT_MODE_EDITORIAL";
  const titleLines=posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22);
  const subtitleLines=textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28));
  const titleSize=preferredTitle,subtitleSize=preferredSubtitle;
  const centerX = layout.x + layout.width / 2;
  const plannedLogoWidth = Math.round(layout.width * (layout.portrait ? 0.115 : 0.10));
  const textTop = metrics?.textTop??(layout.y + Math.round(layout.height * 0.12));
  const titleLineHeight=BRAND_TOKENS.titleLineHeight,subtitleLineHeight=BRAND_TOKENS.subtitleLineHeight;
  let textY = textTop + titleSize;
  const titleNodes = titleLines.map((line, index)=>
    vectorText(DISPLAY_FONT, line, centerX, textY + index * titleSize * titleLineHeight, titleSize, "title")
  ).join("");
  textY = textTop + titleLines.length * titleSize * titleLineHeight + (metrics?.gap??subtitleSize*.45) + subtitleSize;
  const subtitleNodes = subtitleLines.map((line, index)=>
    vectorText(TEXT_FONT, line, centerX, textY + index * subtitleSize * subtitleLineHeight, subtitleSize, "subtitle")
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
  const divider=metrics?.variant==="Cinematic"?[.18,.58]:metrics?.variant==="Minimalist"?[.43,.57]:[.30,.70];
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
          .title { fill:${GOLD}; stroke-width:3px; }
          .subtitle { fill:${PALE_GOLD}; stroke-width:2px; }
          .contact { fill:${IVORY}; stroke-width:1px; }
        </style>
      </defs>
      <rect x="0" y="${scrimTop}" width="${width}" height="${scrimBottom-scrimTop}" fill="url(#scrim)"/>
      <rect x="${Math.round(width*.018)}" y="${Math.round(height*.012)}" width="${Math.round(width*.964)}" height="${Math.round(height*.976)}" rx="${Math.round(width*.004)}" fill="none" stroke="${GOLD}" stroke-opacity=".68" stroke-width="${border}"/>
      <line x1="${layout.x + layout.width*divider[0]}" y1="${dividerY}" x2="${layout.x + layout.width*divider[1]}" y2="${dividerY}" stroke="${GOLD}" stroke-width="${border}" stroke-opacity=".82"/>
      ${posterStrategy?.brandLine?vectorText(DISPLAY_FONT, posterStrategy.brandLine, centerX, brandY, brandSize, "brand"):""}
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
  const layout = layoutFor(width, height, platform, zoneText, hasHeadline, selectedLayout,posterStrategy);
  const { title, subtitle } = headlineParts(headline);
  const story=normalizePlatform(platform)==="Story";
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const titleLines = posterStrategy?.titleLines||semanticLines(title,story?4:3,story?18:22);
  const subtitleLines = textMode==="TEXT_MODE_MINIMAL"?[]:(posterStrategy?.subtitleLines||semanticLines(subtitle,2,28));
  const compositionFactor=selectedLayout?.family==="Cinematic"?.86:selectedLayout?.family==="Minimalist"?.74:1,verticalBias=selectedLayout?.family==="Cinematic"?.25:selectedLayout?.family==="Minimalist"?.75:.5;
  const innerPadding=Math.max(12,Math.round(Math.min(layout.width,layout.height)*.08)),safeWidth=layout.width-innerPadding*2,safeHeight=layout.height-innerPadding*2;
  if(safeWidth<=0||safeHeight<=0)throw new Error("Zone typographique sans dimension exploitable.");
  const titleBudget=subtitleLines.length?safeHeight*.64:safeHeight;
  const titleSize=fitFontSize(DISPLAY_FONT,titleLines,Math.round((story?48:(layout.portrait?67:62))*scale*compositionFactor),BRAND_TOKENS.minimumMobileFontSize,safeWidth,titleBudget,BRAND_TOKENS.titleLineHeight);
  const remainingHeight=Math.max(BRAND_TOKENS.minimumMobileFontSize,safeHeight-titleLines.length*titleSize*BRAND_TOKENS.titleLineHeight-titleSize*.32);
  const subtitleSize=subtitleLines.length?fitFontSize(TEXT_FONT,subtitleLines,Math.round((story?32:(layout.portrait?42:38))*scale*compositionFactor),Math.max(18,BRAND_TOKENS.minimumMobileFontSize*.8),safeWidth,remainingHeight,BRAND_TOKENS.subtitleLineHeight):0;
  const titleBlockHeight=titleLines.length*titleSize*BRAND_TOKENS.titleLineHeight,subtitleBlockHeight=subtitleLines.length*subtitleSize*BRAND_TOKENS.subtitleLineHeight,gap=subtitleLines.length?Math.round(titleSize*.32):0,totalTextHeight=titleBlockHeight+gap+subtitleBlockHeight;
  if(totalTextHeight>safeHeight)throw new Error("Bloc typographique hors textSafeArea après mesure largeur et hauteur.");
  const textTop=layout.y+innerPadding+Math.round(Math.max(0,safeHeight-totalTextHeight)*verticalBias),headlineEnd=textTop+totalTextHeight;
  const dividerY = headlineEnd + Math.round(layout.height * 0.055);
  const cleanLogo = await prepareLogoOverlay(logoBuffer);
  const logoMeta = await sharp(cleanLogo).metadata();
  const logoFraction=posterStrategy?.logoScale==="discreet"?.42:posterStrategy?.logoScale==="standard"?.60:.82;
  const minimumBottomMargin = Math.max(Math.round(height*.035), 24);
  const logoZoneTop=layout.logoArea?.top??Math.round(dividerY + layout.height*.055);
  const logoZoneBottom=layout.logoArea?.bottom??(height-minimumBottomMargin);
  const logoZoneLeft=layout.logoArea?.left??layout.x,logoZoneRight=layout.logoArea?.right??(layout.x+layout.width),logoPadding=Math.max(12,Math.round(Math.min(logoZoneRight-logoZoneLeft,logoZoneBottom-logoZoneTop)*.08));
  const availableHeight=Math.max(24,logoZoneBottom-logoZoneTop-logoPadding*2),availableWidth=Math.max(24,logoZoneRight-logoZoneLeft-logoPadding*2);
  const sourceRatio = (logoMeta.width||1)/(logoMeta.height||1);
  const desiredLogoWidth=Math.round(availableWidth*logoFraction),logoWidth=Math.max(24,Math.min(desiredLogoWidth,availableWidth,Math.floor(availableHeight*sourceRatio)));
  const logoTop=Math.round(logoZoneTop+(logoZoneBottom-logoZoneTop-Math.ceil(logoWidth/sourceRatio))/2),logoLeft=Math.round(logoZoneLeft+(logoZoneRight-logoZoneLeft-logoWidth)/2);
  const estimatedLogoHeight=Math.ceil(logoWidth/sourceRatio);
  if(layout.x<layout.margin||layout.x+layout.width>width-layout.margin)throw new Error("Marges latérales du lock-up insuffisantes.");
  if(logoLeft<0||logoTop<0||logoLeft+logoWidth>width||logoTop+estimatedLogoHeight>height-minimumBottomMargin)throw new Error("Logo hors cadre.");
  if(titleLines.some(line=>measureVectorText(DISPLAY_FONT,line,titleSize)>safeWidth)||subtitleLines.some(line=>measureVectorText(TEXT_FONT,line,subtitleSize)>safeWidth))throw new Error("Texte hors cadre après mesure typographique.");
  const resizedLogo = await sharp(cleanLogo, { failOn: "none" })
    .resize({ width: logoWidth, withoutEnlargement: false, fit: "inside" })
    .png().toBuffer();
  if(await hasOpaqueLogoRectangle(resizedLogo))throw new Error("Rectangle opaque détecté autour du logo officiel.");
  const metrics={titleFontSize:titleSize,subtitleFontSize:subtitleSize,textTop,gap,variant:selectedLayout?.family||"Editorial"};
  const overlaySvg=buildOverlaySvg(width,height,layout,platform,headline,posterStrategy,metrics);
  const output=await image
    .composite([
      { input: overlaySvg, left: 0, top: 0 },
      { input: resizedLogo, left: logoLeft, top: logoTop },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const boxes={text:{left:layout.x,top:layout.y,right:layout.x+layout.width,bottom:layout.y+layout.height},title:{left:layout.x+innerPadding,top:textTop,right:layout.x+layout.width-innerPadding,bottom:textTop+titleBlockHeight},subtitle:{left:layout.x+innerPadding,top:textTop+titleBlockHeight+gap,right:layout.x+layout.width-innerPadding,bottom:headlineEnd},logoSafe:{left:logoZoneLeft,top:logoZoneTop,right:logoZoneRight,bottom:logoZoneBottom},logo:{left:logoLeft,top:logoTop,right:logoLeft+logoWidth,bottom:logoTop+estimatedLogoHeight}};
  const compositionManifest={version:2,platform:normalizePlatform(platform),format:{width,height},variant:selectedLayout?.family||"Editorial",title:posterStrategy?.title||title,subtitle:posterStrategy?.subtitle||subtitle,titleLines,subtitleLines,safeAreas:{text:boxes.text,logo:boxes.logoSafe,source:layout.safeAreaSource},boxes,fontSizes:{title:titleSize,subtitle:subtitleSize},svg:{viewBox:`0 0 ${width} ${height}`,preserveAspectRatio:"xMidYMid meet",titleColor:GOLD,subtitleColor:PALE_GOLD},logo:{sourceWidth:logoMeta.width,sourceHeight:logoMeta.height,renderedWidth:logoWidth,renderedHeight:estimatedLogoHeight,sourceRatio,renderedRatio:logoWidth/estimatedLogoHeight,fit:"contain",fullyVisible:true,opaqueRectangle:false},checks:{titleWithinSafeArea:boxes.title.left>=boxes.text.left&&boxes.title.right<=boxes.text.right&&boxes.title.top>=boxes.text.top&&boxes.title.bottom<=boxes.text.bottom,subtitleWithinSafeArea:boxes.subtitle.left>=boxes.text.left&&boxes.subtitle.right<=boxes.text.right&&boxes.subtitle.top>=boxes.text.top&&boxes.subtitle.bottom<=boxes.text.bottom,textWithinSafeArea:true,logoWithinSafeArea:boxes.logo.left>=boxes.logoSafe.left&&boxes.logo.right<=boxes.logoSafe.right&&boxes.logo.top>=boxes.logoSafe.top&&boxes.logo.bottom<=boxes.logoSafe.bottom,titleSubtitleCollision:boxes.title.bottom>boxes.subtitle.top,textLogoCollision:boxes.text.bottom>boxes.logoSafe.top,canvasOverflow:Object.values({title:boxes.title,subtitle:boxes.subtitle,logo:boxes.logo}).some(box=>box.left<0||box.top<0||box.right>width||box.bottom>height),opaqueLogoRectangle:false,formatSpecificRecomposition:true,mobileReadabilityEstimated:titleSize>=BRAND_TOKENS.minimumMobileFontSize},imageGenerationCallCount:0};
  compositionManifest.checks.textWithinSafeArea=compositionManifest.checks.titleWithinSafeArea&&compositionManifest.checks.subtitleWithinSafeArea;
  if(!compositionManifest.checks.titleWithinSafeArea||!compositionManifest.checks.subtitleWithinSafeArea||!compositionManifest.checks.logoWithinSafeArea||compositionManifest.checks.titleSubtitleCollision||compositionManifest.checks.textLogoCollision||compositionManifest.checks.canvasOverflow)throw new Error("Composition refusée : collision ou sortie de zone détectée.");
  Object.defineProperty(output,"compositionManifest",{value:compositionManifest,enumerable:false});
  return output;
}

module.exports = { BRAND_TOKENS, composeBrandPoster, dataUrlToBuffer, escapeXml, wrapWords, normalizedZone,normalizedBox,resolveSafeAreas,prepareLogoOverlay,hasOpaqueLogoRectangle,vectorText,measureVectorText,fitFontSize,layoutFor,BRAND_CONTACTS };
