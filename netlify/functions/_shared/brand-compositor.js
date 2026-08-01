"use strict";

const sharp = require("sharp");

const GOLD = "#D9AD3B";
const PALE_GOLD = "#F0D889";
const IVORY = "#F7F2E8";

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

function layoutFor(width, height, platform, requestedZone, hasHeadline){
  const zone = normalizedZone(requestedZone, platform);
  const portrait = height > width * 1.35;
  const landscape = width > height * 1.35;
  const margin = Math.round(width * (portrait ? 0.065 : 0.052));
  const boxW = landscape ? Math.round(width * 0.56) : width - margin * 2;
  const boxH = Math.round(height * (hasHeadline ? (portrait ? 0.39 : 0.43) : 0.23));
  const x = landscape ? margin : margin;
  let y;
  if(zone === "top") y = Math.round(height * 0.055);
  else if(zone === "center") y = Math.round((height - boxH) * 0.50);
  else y = height - boxH - Math.round(height * 0.055);
  return { x, y, width: boxW, height: boxH, margin, portrait, landscape };
}

function buildOverlaySvg(width, height, layout, platform, headline){
  const { title, subtitle } = headlineParts(headline);
  const scale = Math.max(0.78, Math.min(1.55, width / 1088));
  const titleSize = Math.round((layout.portrait ? 67 : 62) * scale);
  const subtitleSize = Math.round((layout.portrait ? 42 : 38) * scale);
  const brandSize = Math.round((layout.portrait ? 31 : 29) * scale);
  const citySize = Math.round(16 * scale);
  const titleLines = wrapWords(title.toUpperCase(), layout.portrait ? 24 : 31, 2);
  const subtitleLines = wrapWords(subtitle.toUpperCase(), layout.portrait ? 34 : 44, 2);
  const centerX = layout.x + layout.width / 2;
  const logoSpace = Math.round(layout.height * (headline ? 0.32 : 0.48));
  const brandY = layout.y + logoSpace;
  let textY = brandY + brandSize * 2.35;
  const titleNodes = titleLines.map((line, index)=>
    `<text x="${centerX}" y="${textY + index * titleSize * 1.05}" class="title">${escapeXml(line)}</text>`
  ).join("");
  textY += titleLines.length * titleSize * 1.05 + subtitleSize * 0.55;
  const subtitleNodes = subtitleLines.map((line, index)=>
    `<text x="${centerX}" y="${textY + index * subtitleSize * 1.10}" class="subtitle">${escapeXml(line)}</text>`
  ).join("");
  const scrimTop = Math.max(0, layout.y - Math.round(height * 0.025));
  const scrimBottom = Math.min(height, layout.y + layout.height + Math.round(height * 0.025));
  const border = Math.max(2, Math.round(width * 0.0017));
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
          .brand,.city,.title,.subtitle { text-anchor:middle; font-family:Georgia,'Times New Roman',serif; paint-order:stroke fill; stroke:#050505; stroke-opacity:.72; }
          .brand { fill:${IVORY}; font-size:${brandSize}px; font-weight:600; letter-spacing:${Math.round(brandSize*.09)}px; stroke-width:2px; }
          .city { fill:${GOLD}; font-size:${citySize}px; font-weight:600; letter-spacing:${Math.round(citySize*.28)}px; stroke-width:1px; }
          .title { fill:${IVORY}; font-size:${titleSize}px; font-weight:600; letter-spacing:${Math.round(titleSize*.07)}px; stroke-width:3px; }
          .subtitle { fill:${PALE_GOLD}; font-size:${subtitleSize}px; font-weight:500; letter-spacing:${Math.round(subtitleSize*.09)}px; stroke-width:2px; }
        </style>
      </defs>
      <rect x="0" y="${scrimTop}" width="${width}" height="${scrimBottom-scrimTop}" fill="url(#scrim)"/>
      <rect x="${Math.round(width*.018)}" y="${Math.round(height*.012)}" width="${Math.round(width*.964)}" height="${Math.round(height*.976)}" rx="${Math.round(width*.004)}" fill="none" stroke="${GOLD}" stroke-opacity=".68" stroke-width="${border}"/>
      <line x1="${layout.x + layout.width*.16}" y1="${brandY - brandSize*.62}" x2="${layout.x + layout.width*.36}" y2="${brandY - brandSize*.62}" stroke="${GOLD}" stroke-width="${border}" stroke-opacity=".82"/>
      <line x1="${layout.x + layout.width*.64}" y1="${brandY - brandSize*.62}" x2="${layout.x + layout.width*.84}" y2="${brandY - brandSize*.62}" stroke="${GOLD}" stroke-width="${border}" stroke-opacity=".82"/>
      <text x="${centerX}" y="${brandY}" class="brand">LA SANTÉ DES ZÈBRES</text>
      <text x="${centerX}" y="${brandY + brandSize*1.38}" class="city">RAISMES</text>
      ${titleNodes}${subtitleNodes}
    </svg>`);
}

async function composeBrandPoster({ imageBuffer, logoDataUrl, platform, headline, zoneText }){
  if(!imageBuffer || !Buffer.isBuffer(imageBuffer)) throw new Error("Image générée absente du compositeur.");
  const logoBuffer = dataUrlToBuffer(logoDataUrl);
  const image = sharp(imageBuffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width;
  const height = meta.height;
  if(!width || !height) throw new Error("Dimensions de l'image générée introuvables.");
  const hasHeadline = Boolean(String(headline || "").trim());
  const layout = layoutFor(width, height, platform, zoneText, hasHeadline);
  const logoWidth = Math.round(layout.width * (layout.portrait ? 0.19 : 0.16));
  const logoTop = layout.y + Math.round(layout.height * 0.025);
  const logoLeft = Math.round(layout.x + (layout.width - logoWidth) / 2);
  const resizedLogo = await sharp(logoBuffer, { failOn: "none" })
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

module.exports = { composeBrandPoster, dataUrlToBuffer, escapeXml, wrapWords, normalizedZone };
