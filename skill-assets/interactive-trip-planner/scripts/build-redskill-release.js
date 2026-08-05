#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceSkillRoot = path.resolve(scriptDir, "..");
const outputRootArg = process.argv[2];
const version = process.argv[3] || "0.1.0";

if (!outputRootArg) {
  console.error("Usage: node scripts/build-redskill-release.js <release-directory> [version]");
  process.exit(1);
}

const outputRoot = path.resolve(outputRootArg);
const targetSkillRoot = path.join(outputRoot, "interactive-trip-planner");
if (
  outputRoot === sourceSkillRoot
  || targetSkillRoot === sourceSkillRoot
  || targetSkillRoot === path.parse(targetSkillRoot).root
  || path.basename(targetSkillRoot) !== "interactive-trip-planner"
) {
  throw new Error(`unsafe REDSkill release target: ${targetSkillRoot}`);
}

const isExcluded = (sourcePath) => {
  const relative = path.relative(sourceSkillRoot, sourcePath);
  if (!relative) return false;
  const segments = relative.split(path.sep);
  if (segments.includes(".DS_Store")) return true;
  if (segments[0] === "agents") return true;
  return segments.includes("vendor") && segments.includes("leaflet");
};

fs.mkdirSync(outputRoot, { recursive: true });
fs.rmSync(targetSkillRoot, { recursive: true, force: true });
fs.rmSync(path.join(outputRoot, ".DS_Store"), { force: true });
fs.cpSync(sourceSkillRoot, targetSkillRoot, {
  recursive: true,
  filter: (sourcePath) => !isExcluded(sourcePath),
});

const releasePackagePath = path.join(targetSkillRoot, "package.json");
const releasePackage = JSON.parse(fs.readFileSync(releasePackagePath, "utf8"));
releasePackage.version = version;
fs.writeFileSync(releasePackagePath, `${JSON.stringify(releasePackage, null, 2)}\n`);

const readSource = (...segments) => fs.readFileSync(path.join(sourceSkillRoot, ...segments), "utf8");
const sanitizeLeafletCss = (css) => css
  .replace(/\s*background-image:\s*url\(images\/layers\.png\);/g, "\n\tbackground-image: none;")
  .replace(/\s*background-image:\s*url\(images\/layers-2x\.png\);/g, "\n\tbackground-image: none;")
  .replace(/\s*background-image:\s*url\(images\/marker-icon\.png\);/g, "\n\tbackground-image: none;");
const leafletCss = sanitizeLeafletCss(readSource("assets", "guide-template-europe-public", "maps", "vendor", "leaflet", "leaflet.css"));
const leafletJs = readSource("assets", "guide-template-europe-public", "maps", "vendor", "leaflet", "leaflet.js");

function replaceExactly(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`missing ${label}`);
  const next = text.replace(search, replacement);
  if (next.includes(search)) throw new Error(`duplicate ${label}`);
  return next;
}

function inlinePublicMap() {
  const mapPath = path.join(targetSkillRoot, "assets", "guide-template-europe-public", "maps", "itinerary-map.html");
  let html = fs.readFileSync(mapPath, "utf8");
  html = replaceExactly(
    html,
    '  <link rel="stylesheet" href="./vendor/leaflet/leaflet.css">',
    `  <style>\n    /* REDSkill embedded Leaflet CSS */\n${leafletCss}\n  </style>`,
    "public Leaflet stylesheet reference",
  );
  html = replaceExactly(
    html,
    '  <script src="./vendor/leaflet/leaflet.js"></script>\n  <script>',
    `  <script>\n    /* REDSkill embedded Leaflet JS */\n${leafletJs}\n`,
    "public Leaflet script reference",
  );
  fs.writeFileSync(mapPath, html);
}

function inlineLightMap() {
  const mapPath = path.join(targetSkillRoot, "assets", "guide-template", "maps", "itinerary-map.html");
  const coreCss = readSource("assets", "guide-template", "maps", "assets", "trip-map-core.css");
  const stateJs = readSource("assets", "guide-template", "maps", "assets", "trip-map-state.js");
  const coreJs = readSource("assets", "guide-template", "maps", "assets", "trip-map-core.js");
  let html = fs.readFileSync(mapPath, "utf8");
  html = replaceExactly(
    html,
    '  <link rel="stylesheet" href="vendor/leaflet/leaflet.css">',
    `  <style>\n    /* REDSkill embedded Leaflet CSS */\n${leafletCss}\n  </style>`,
    "light Leaflet stylesheet reference",
  );
  html = replaceExactly(
    html,
    '  <link rel="stylesheet" href="assets/trip-map-core.css">',
    `  <style>\n    /* REDSkill embedded trip-map-core.css */\n${coreCss}\n  </style>`,
    "light Core stylesheet reference",
  );
  html = replaceExactly(
    html,
    '  <script src="vendor/leaflet/leaflet.js"></script>',
    `  <script>\n    /* REDSkill embedded Leaflet JS */\n${leafletJs}\n  </script>`,
    "light Leaflet script reference",
  );
  html = replaceExactly(
    html,
    '  <script src="assets/trip-map-state.js"></script>',
    `  <script>\n    /* REDSkill embedded trip-map-state.js */\n${stateJs}\n  </script>`,
    "light state script reference",
  );
  html = replaceExactly(
    html,
    '  <script src="assets/trip-map-core.js"></script>',
    `  <script>\n    /* REDSkill embedded trip-map-core.js */\n${coreJs}\n  </script>`,
    "light Core script reference",
  );
  fs.writeFileSync(mapPath, html);
}

function rewriteReleaseInstructions() {
  const readmePath = path.join(targetSkillRoot, "assets", "guide-template", "README.md");
  let readme = fs.readFileSync(readmePath, "utf8");
  readme = replaceExactly(
    readme,
    "不要先替换地图技术，也不要在每个攻略中重写状态规则。以下文件属于共享 Core，应保持行为一致：\n\n- `maps/assets/trip-map-state.js`\n- `maps/assets/trip-map-core.js`\n- `maps/assets/trip-map-core.css`\n- `maps/vendor/leaflet/`",
    "不要先替换地图技术，也不要在每个攻略中重写状态规则。REDSkill 发布版的 `maps/itinerary-map.html` 已内联 Leaflet 与 Core CSS/JS，是可单独复制和打开的单个 HTML；`maps/assets/` 只保留为源码与验证参考，不再依赖单独的 Leaflet vendor 目录。",
    "light template release instructions",
  );
  fs.writeFileSync(readmePath, readme);
}

inlinePublicMap();
inlineLightMap();
rewriteReleaseInstructions();

console.log(`built REDSkill ${version} release at ${outputRoot}`);
