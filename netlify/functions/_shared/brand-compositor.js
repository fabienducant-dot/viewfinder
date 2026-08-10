"use strict";

const fs = require("fs");
const sharp = require("sharp");
const opentype = require("opentype.js");
const { PLATFORM_TEMPLATES, normalizePlatform } = require("./v3-layout-engine");

const GOLD = "#D9AD3B";
const PALE_GOLD = "#F0D889";
const IVORY = "#F7F2E8";
const BRAND_CONTACTS = Object.freeze({
  domain:"la-sante-des-zebres.com", phone:"06.84.40.69.54",
  address:"11 cour Dupas, Raismes", email:"fabien.ducant@gmail.com",
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

function layoutFor(width, height, platform, requestedZone, hasHeadline, selectedLayout){
  const normalized=normalizePlatform(platform);
  const template=(selectedLayout&&selectedLayout.template)||PLATFORM_TEMPLATES[normalized];
  if(template){
    const spec=template.lockup;
    const margin=Math.round(width*template.margins);
    return {x:Math.round(width*spec.x),y:Math.round(height*spec.y),width:Math.round(width*spec.width),height:Math.min(Math.round(height*(hasHeadline?.28:.22)),height-Math.round(height*spec.y)-margin),margin,portrait:height>width*1.35,landscape:width>height*1.35,template,align:spec.align};
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

function buildOverlaySvg(width, height, layout, platform, headline){
  const { title, subtitle } = headlineParts(headline);
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const titleSize = Math.round((layout.portrait ? 67 : 62) * scale);
  const subtitleSize = Math.round((layout.portrait ? 42 : 38) * scale);
  const brandSize = Math.round((layout.portrait ? 29 : 27) * scale);
  const citySize = Math.round(15 * scale);
  const titleLines = wrapWords(title.toUpperCase(), layout.portrait ? 24 : 31, 2);
  const subtitleLines = wrapWords(subtitle.toUpperCase(), layout.portrait ? 34 : 44, 2);
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
  const brandY = plannedLogoTop + plannedLogoWidth + Math.round(brandSize * 1.18);
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
  const source = sharp(logoBuffer, { failOn: "none" }).rotate().ensureAlpha();
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  const borderDepth = Math.max(2, Math.round(Math.min(info.width, info.height) * .025));
  let borderSamples = 0;
  let opaqueDarkBorder = 0;
  for(let y=0; y<info.height; y++){
    for(let x=0; x<info.width; x++){
      if(x>=borderDepth && x<info.width-borderDepth && y>=borderDepth && y<info.height-borderDepth) continue;
      const offset=(y*info.width+x)*info.channels;
      borderSamples++;
      if(Math.max(px[offset],px[offset+1],px[offset+2])<50 && px[offset+3]>245) opaqueDarkBorder++;
    }
  }
  const opaqueDarkBorderRatio = borderSamples ? opaqueDarkBorder / borderSamples : 0;

  /* Certains logos enregistrés sont des JPEG/PNG opaques sur rectangle noir. On ne détoure que
     si au moins trois coins prouvent ce fond. Les pixels dorés restent intacts ; le noir de fond
     devient transparent et ne forme plus de vignette rectangulaire sur l'affiche. */
  if(opaqueDarkBorderRatio >= .60){
    for(let i=0; i<px.length; i+=info.channels){
      const luminance = Math.max(px[i], px[i+1], px[i+2]);
      const backgroundAlpha = luminance <= 16 ? 0 : luminance >= 62 ? 1 : (luminance - 16) / 46;
      px[i+3] = Math.round(px[i+3] * backgroundAlpha);
    }
  }

  return sharp(px, { raw: info })
    .trim({ background: { r:0, g:0, b:0, alpha:0 } })
    .png()
    .toBuffer();
}

async function composeBrandPoster({ imageBuffer, logoDataUrl, platform, headline, zoneText, selectedLayout }){
  if(!imageBuffer || !Buffer.isBuffer(imageBuffer)) throw new Error("Image générée absente du compositeur.");
  const logoBuffer = dataUrlToBuffer(logoDataUrl);
  const image = sharp(imageBuffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width;
  const height = meta.height;
  if(!width || !height) throw new Error("Dimensions de l'image générée introuvables.");
  const hasHeadline = Boolean(String(headline || "").trim());
  const layout = layoutFor(width, height, platform, zoneText, hasHeadline, selectedLayout);
  const { title, subtitle } = headlineParts(headline);
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const titleSize = Math.round((layout.portrait ? 67 : 62) * scale);
  const subtitleSize = Math.round((layout.portrait ? 42 : 38) * scale);
  const titleLines = wrapWords(title.toUpperCase(), layout.portrait ? 24 : 31, 2);
  const subtitleLines = wrapWords(subtitle.toUpperCase(), layout.portrait ? 34 : 44, 2);
  const textTop = layout.y + Math.round(layout.height * 0.12);
  const textY = textTop + titleSize + titleLines.length * titleSize * 1.05 + subtitleSize * 0.45;
  const headlineEnd = textY + Math.max(1, subtitleLines.length) * subtitleSize * 1.10;
  const dividerY = headlineEnd + Math.round(layout.height * 0.055);
  const cleanLogo = await prepareLogoOverlay(logoBuffer);
  const logoMeta = await sharp(cleanLogo).metadata();
  const desiredLogoWidth = Math.round(layout.width * (layout.portrait ? 0.115 : 0.10));
  const minimumBottomMargin = Math.max(Math.round(height*.035), 24);
  const availableHeight = Math.max(24, height - minimumBottomMargin - Math.round(dividerY + layout.height*.055));
  const sourceRatio = (logoMeta.width||1)/(logoMeta.height||1);
  const logoWidth = Math.max(24, Math.min(desiredLogoWidth, Math.floor(availableHeight*sourceRatio)));
  const logoTop = Math.min(height-minimumBottomMargin-Math.ceil(logoWidth/sourceRatio), Math.round(dividerY + layout.height * 0.055));
  const logoLeft = Math.round(layout.x + (layout.width - logoWidth) / 2);
  const resizedLogo = await sharp(cleanLogo, { failOn: "none" })
    .resize({ width: logoWidth, withoutEnlargement: false, fit: "inside" })
    .png().toBuffer();
  const overlaySvg = buildOverlaySvg(width, height, layout, platform, headline);
  return image
    .composite([
      { input: overlaySvg, left: 0, top: 0 },
      { input: resizedLogo, left: logoLeft, top: logoTop },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

module.exports = { composeBrandPoster, dataUrlToBuffer, escapeXml, wrapWords, normalizedZone, prepareLogoOverlay, vectorText, layoutFor, BRAND_CONTACTS };
