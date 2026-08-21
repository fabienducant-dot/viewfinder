"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { TextDecoder } = require("node:util");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.html");
const bytes = fs.readFileSync(indexPath);

let html;
try {
  html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
} catch (error) {
  throw new Error(`index.html n'est pas un fichier UTF-8 valide : ${error.message}`);
}

if (html.includes("\uFFFD")) {
  throw new Error("index.html contient des caractères de remplacement Unicode (fichier corrompu)." );
}

const forbiddenControl = html.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
if (forbiddenControl) {
  throw new Error(`index.html contient un caractère de contrôle interdit U+${forbiddenControl[0].charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}.`);
}

if (bytes.length < 600000) {
  throw new Error(`index.html paraît tronqué (${bytes.length} octets).`);
}
if (!html.trimEnd().endsWith("</html>")) {
  throw new Error("index.html ne se termine pas par </html>." );
}
if (!html.includes('<script src="./v3-service-menu.js"></script>')) {
  throw new Error("La dépendance v3-service-menu.js est absente de index.html." );
}

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(source => source.trim());

if (inlineScripts.length !== 1) {
  throw new Error(`Nombre inattendu de scripts inline : ${inlineScripts.length} au lieu de 1.`);
}

new vm.Script(inlineScripts[0], { filename: "index-inline.js" });

for (const marker of [
  "function renderMain()",
  "renderNav();",
  "renderMain();",
  "updateCount();",
  'const VF_VERSION = "3.2.1-index-integrity"',
]) {
  if (!inlineScripts[0].includes(marker)) {
    throw new Error(`Marqueur de démarrage absent de index.html : ${marker}`);
  }
}

console.log(`index.html valide : ${bytes.length} octets, UTF-8, JavaScript analysable, démarrage complet.`);
