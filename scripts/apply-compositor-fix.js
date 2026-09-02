"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const compositorPath = path.join(root, "netlify/functions/_shared/brand-compositor.js");
const netlifyPath = path.join(root, "netlify.toml");
const brandTestPath = path.join(root, "tests/brand-pipeline.test.js");
const stabilityTestPath = path.join(root, "tests/v3-compositor-server-stability.test.js");
const assetPath = path.join(root, "assets/sdz-logo-compositor.png");
const goldenPath = path.join(root, "artifacts/compositor-logo-golden-story.png");

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one occurrence, found ${count}`);
  return source.replace(before, after);
}

async function buildTransparentOfficialAsset() {
  const sourcePath = path.join(root, "icons/icon-512.png");
  const source = sharp(sourcePath, { failOn: "none" }).rotate().ensureAlpha();
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  const seen = new Uint8Array(info.width * info.height);
  const queue = [];
  const dark = (x, y) => {
    const o = (y * info.width + x) * info.channels;
    return px[o + 3] > 0 && Math.max(px[o], px[o + 1], px[o + 2]) <= 55;
  };
  const seed = (x, y) => {
    const i = y * info.width + x;
    if (!seen[i] && dark(x, y)) {
      seen[i] = 1;
      queue.push([x, y]);
    }
  };
  for (let x = 0; x < info.width; x++) { seed(x, 0); seed(x, info.height - 1); }
  for (let y = 0; y < info.height; y++) { seed(0, y); seed(info.width - 1, y); }
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q];
    const o = (y * info.width + x) * info.channels;
    px[o + 3] = 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx >= 0 && ny >= 0 && nx < info.width && ny < info.height) seed(nx, ny);
    }
  }
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  await sharp(px, { raw: info })
    .resize({ width: 512, height: 512, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(assetPath);
  const meta = await sharp(assetPath).metadata();
  if (meta.format !== "png" || meta.width !== 512 || meta.height !== 512 || meta.hasAlpha !== true) {
    throw new Error("Generated official logo asset is not a transparent 512x512 PNG");
  }
  const { data: check, info: ci } = await sharp(assetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => check[(y * ci.width + x) * ci.channels + 3];
  if ([alphaAt(0,0), alphaAt(511,0), alphaAt(0,511), alphaAt(511,511)].some(a => a > 10)) {
    throw new Error("Generated official logo asset still has an opaque outer rectangle");
  }
}

function patchCompositor() {
  let s = fs.readFileSync(compositorPath, "utf8");
  s = replaceOnce(s, 'const crypto = require("crypto");', 'const path = require("path");', "crypto/path import");
  s = replaceOnce(s, 'const COMPOSITOR_VERSION="2.0.0-safe-lockup";', 'const COMPOSITOR_VERSION="2.3.0-official-transparent-logo-asset";', "compositor version");
  s = replaceOnce(s,
    'const TRANSPARENT_LOGO_CACHE = new Map();',
    'const OFFICIAL_LOGO_PATH = path.resolve(__dirname, "../../../assets/sdz-logo-compositor.png");\nlet OFFICIAL_LOGO_CACHE = null;',
    "logo cache declaration");
  const prepareRe = /async function prepareLogoOverlay\(logoBuffer\)\{[\s\S]*?\n\}\n\nasync function composeBrandPoster/;
  if (!prepareRe.test(s)) throw new Error("prepareLogoOverlay block not found");
  s = s.replace(prepareRe, `async function prepareLogoOverlay(){
  if(OFFICIAL_LOGO_CACHE) return Buffer.from(OFFICIAL_LOGO_CACHE);
  const output = fs.readFileSync(OFFICIAL_LOGO_PATH);
  const meta = await sharp(output, { failOn: "none" }).metadata();
  if(meta.format !== "png" || meta.width !== 512 || meta.height !== 512 || meta.hasAlpha !== true){
    throw new Error("Actif logo officiel invalide : PNG transparent 512 × 512 attendu.");
  }
  if(await hasOpaqueLogoRectangle(output)) throw new Error("Rectangle opaque détecté autour du logo officiel.");
  OFFICIAL_LOGO_CACHE = Buffer.from(output);
  return Buffer.from(output);
}

async function composeBrandPoster`);
  s = replaceOnce(s, '  const logoBuffer = dataUrlToBuffer(logoDataUrl);\n', '', "legacy logoDataUrl decoding");
  s = replaceOnce(s, '  const cleanLogo = await prepareLogoOverlay(logoBuffer);', '  const cleanLogo = await prepareLogoOverlay();', "static official logo read");
  s = replaceOnce(s,
    '  const desiredLogoWidth = Math.round(logoAreaWidth * logoFraction/.21);',
    '  const desiredLogoWidth = story ? Math.round(width * .35) : Math.round(logoAreaWidth * logoFraction/.21);',
    "Story logo width");
  s = replaceOnce(s,
    '    logoRectangleOpaque:false,\n',
    '    logoRectangleOpaque:false,\n    runtimeLogoSegmentation:false,\n    officialTransparentLogoAsset:true,\n',
    "composition manifest logo flags");
  fs.writeFileSync(compositorPath, s);
}

function patchNetlify() {
  let s = fs.readFileSync(netlifyPath, "utf8");
  const processBlock = '[functions."process-image-job-background"]\n  external_node_modules = ["sharp", "opentype.js", "@fontsource/cinzel"]';
  s = replaceOnce(s, processBlock, `${processBlock}\n  included_files = ["assets/sdz-logo-compositor.png"]`, "process function bundle");
  if (!s.includes('[functions."recompose-image-job"]')) {
    s = s.replace('\n[functions."check-scheduled-posts"]', '\n[functions."recompose-image-job"]\n  included_files = ["assets/sdz-logo-compositor.png"]\n\n[functions."check-scheduled-posts"]');
  }
  fs.writeFileSync(netlifyPath, s);
}

function patchBrandTest() {
  let s = fs.readFileSync(brandTestPath, "utf8");
  const re = /test\("un logo opaque sur fond noir est détouré avant composition", async \(\) => \{[\s\S]*?\n\}\);\n\ntest\("le contrôle final/;
  if (!re.test(s)) throw new Error("legacy dynamic-logo test block not found");
  s = s.replace(re, `test("le logo maître transparent est chargé tel quel, sans segmentation runtime", async () => {
  const asset = fs.readFileSync(path.join(root, "assets/sdz-logo-compositor.png"));
  const meta = await sharp(asset).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, 512);
  assert.equal(meta.height, 512);
  assert.equal(meta.hasAlpha, true);
  const clean = await prepareLogoOverlay();
  assert.deepEqual(clean, asset);
  const { data, info } = await sharp(clean).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const alpha = (x,y)=>data[(y*info.width+x)*info.channels+3];
  assert.ok([alpha(0,0),alpha(511,0),alpha(0,511),alpha(511,511)].every(value=>value<10));
  const compositor = fs.readFileSync(path.join(root, "netlify/functions/_shared/brand-compositor.js"), "utf8");
  assert.match(compositor, /2\\.3\\.0-official-transparent-logo-asset/);
  assert.match(compositor, /runtimeLogoSegmentation:false/);
  assert.match(compositor, /officialTransparentLogoAsset:true/);
  assert.doesNotMatch(compositor, /const seen=new Uint8Array|queue=\\[\\]/);
});

test("le contrôle final`);
  fs.writeFileSync(brandTestPath, s);
}

function writeStabilityTest() {
  const source = `"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { composeBrandPoster, prepareLogoOverlay, COMPOSITOR_VERSION } = require("../netlify/functions/_shared/brand-compositor");
const root = path.resolve(__dirname, "..");

test("le compositor V2.3 utilise l'actif officiel statique sans détourage runtime", async () => {
  assert.equal(COMPOSITOR_VERSION, "2.3.0-official-transparent-logo-asset");
  const assetPath = path.join(root, "assets/sdz-logo-compositor.png");
  assert.equal(fs.existsSync(assetPath), true);
  const asset = fs.readFileSync(assetPath);
  const meta = await sharp(asset).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, 512);
  assert.equal(meta.height, 512);
  assert.equal(meta.hasAlpha, true);
  assert.deepEqual(await prepareLogoOverlay(Buffer.from("ignored")), asset);
  const code = fs.readFileSync(path.join(root, "netlify/functions/_shared/brand-compositor.js"), "utf8");
  assert.match(code, /OFFICIAL_LOGO_PATH/);
  assert.match(code, /runtimeLogoSegmentation:false/);
  assert.match(code, /officialTransparentLogoAsset:true/);
  assert.doesNotMatch(code, /const seen=new Uint8Array|queue=\\[\\]/);
});

test("la Story réserve un médaillon proche de 33% et expose le manifeste de stabilité", async () => {
  const imageBuffer = await sharp({ create:{ width:1088,height:1920,channels:4,background:"#17120b" } }).png().toBuffer();
  const output = await composeBrandPoster({
    imageBuffer,
    logoDataUrl:"data:image/png;base64,ignored",
    platform:"Story",
    headline:"DOULEURS DORSALES | BLOCAGES ET LOURDEURS",
    zoneText:"inférieure",
    posterStrategy:{
      textMode:"TEXT_MODE_EDITORIAL",
      title:"DOULEURS DORSALES",
      subtitle:"BLOCAGES ET LOURDEURS",
      textSafeArea:{left:.08,right:.92,top:.52,bottom:.68},
      logoSafeArea:{left:.08,right:.92,top:.70,bottom:.94}
    }
  });
  const meta = await sharp(output).metadata();
  assert.equal(meta.width,1080);
  assert.equal(meta.height,1920);
  assert.equal(output.compositionManifest.runtimeLogoSegmentation,false);
  assert.equal(output.compositionManifest.officialTransparentLogoAsset,true);
  const ratio = output.compositionManifest.logoBounds.width / 1080;
  assert.ok(ratio >= .33 && ratio <= .36, `logo ratio ${ratio}`);
});

test("Netlify embarque explicitement le PNG officiel dans les deux fonctions de composition", () => {
  const toml = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
  assert.match(toml, /process-image-job-background[\\s\\S]*included_files = \\["assets\\/sdz-logo-compositor\\.png"\\]/);
  assert.match(toml, /recompose-image-job[\\s\\S]*included_files = \\["assets\\/sdz-logo-compositor\\.png"\\]/);
});
`;
  fs.writeFileSync(stabilityTestPath, source);
}

async function writeGoldenStory() {
  delete require.cache[require.resolve("../netlify/functions/_shared/brand-compositor")];
  const { composeBrandPoster } = require("../netlify/functions/_shared/brand-compositor");
  const imageBuffer = await sharp({ create:{ width:1088,height:1920,channels:4,background:"#17120b" } }).png().toBuffer();
  const output = await composeBrandPoster({
    imageBuffer,
    platform:"Story",
    headline:"DOULEURS DORSALES | BLOCAGES ET LOURDEURS",
    zoneText:"inférieure",
    posterStrategy:{
      textMode:"TEXT_MODE_EDITORIAL",
      title:"DOULEURS DORSALES",
      subtitle:"BLOCAGES ET LOURDEURS",
      textSafeArea:{left:.08,right:.92,top:.52,bottom:.68},
      logoSafeArea:{left:.08,right:.92,top:.70,bottom:.94}
    }
  });
  fs.mkdirSync(path.dirname(goldenPath), { recursive:true });
  fs.writeFileSync(goldenPath, output);
}

(async()=>{
  await buildTransparentOfficialAsset();
  patchCompositor();
  patchNetlify();
  patchBrandTest();
  writeStabilityTest();
  await writeGoldenStory();
  console.log("COMPOSITOR_FIX_APPLIED=true");
})().catch(err=>{ console.error(err); process.exit(1); });
