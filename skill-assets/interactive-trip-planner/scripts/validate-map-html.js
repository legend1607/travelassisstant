#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function usage() {
  return "Usage: node validate-map-html.js guides/<trip-slug>/maps/itinerary-map.html";
}

const filePath = process.argv[2];
if (!filePath || filePath === "--help" || filePath === "-h") {
  console.log(usage());
  process.exit(filePath ? 0 : 1);
}

const htmlPath = path.resolve(filePath);
let html;
try {
  html = fs.readFileSync(htmlPath, "utf8");
} catch (error) {
  console.error(`Cannot read ${htmlPath}: ${error.message}`);
  process.exit(1);
}

const coreMissing = [];
const enhancementWarnings = [];
const syntaxWarnings = [];
const localScripts = [];
const localStyles = [];
const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)]
  .map((match) => match[1]);

for (const source of scriptSources) {
  if (/^https?:\/\//i.test(source)) continue;
  const scriptPath = path.resolve(path.dirname(htmlPath), source.split(/[?#]/, 1)[0]);
  if (!fs.existsSync(scriptPath)) {
    coreMissing.push(`local script: ${source}`);
    continue;
  }
  const text = fs.readFileSync(scriptPath, "utf8");
  localScripts.push({ source, scriptPath, text });
  if (/trip-map-(?:public-)?(state|core|route)\.js$/i.test(source)) {
    const syntax = spawnSync(process.execPath, ["--check", scriptPath], { encoding: "utf8" });
    if (syntax.status !== 0) {
      coreMissing.push(`script syntax: ${source}`);
      syntaxWarnings.push((syntax.stdout + syntax.stderr).trim());
    }
  }
}

const styleSources = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1]);
for (const source of styleSources) {
  if (/^https?:\/\//i.test(source)) continue;
  const stylePath = path.resolve(path.dirname(htmlPath), source.split(/[?#]/, 1)[0]);
  if (!fs.existsSync(stylePath)) {
    coreMissing.push(`local stylesheet: ${source}`);
    continue;
  }
  localStyles.push(fs.readFileSync(stylePath, "utf8"));
}

const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
for (const [index, script] of inlineScripts.entries()) {
  try {
    new Function(script);
  } catch (error) {
    coreMissing.push(`inline script ${index + 1} syntax`);
    syntaxWarnings.push(error.message);
  }
}

const combined = [html, ...localScripts.map((item) => item.text), ...localStyles].join("\n");
const coreChecks = [
  ["map container", /id=["']map["']/],
  ["real Leaflet map", /\bL\.map\(|tileLayer\(/],
  ["trip overview", /id=["']trip-overview["']/],
  ["day cards", /id=["']day-list["']/],
  ["day rail", /id=["']day-rail["']/],
  ["day place list", /id=["']day-place-list["']/],
  ["place detail", /id=["']poi-detail["']/],
  ["place search", /id=["']quick-search["']|type=["']search["']/],
  ["city filter", /id=["']filter-city["']/],
  ["category filter", /id=["']filter-category["']/],
  ["priority filter", /id=["']filter-priority["']/],
  ["plan filter", /id=["']filter-plan["']/],
  ["priority edit", /data-action=["']set-priority["']|type:\s*["']set-priority["']/],
  ["day assignment edit", /assign-day|move-day/],
  ["day removal edit", /data-action=\\?["']remove-day|type:\s*["']remove-day["']/],
  ["day ordering edit", /data-move-order|type:\s*["']move-order["']/],
  ["impact confirmation", /id=["']impact-dialog["'].*id=["']confirm-impact["']/s],
  ["undo control", /id=["']undo-change["']|undoLastAction/],
  ["change summary", /id=["']change-summary["']|renderChangeSummary/],
  ["replan dialog", /id=["']replan-dialog["']|buildReplanPrompt/],
  ["copy feedback", /navigator\.clipboard\.writeText|id=["']copy-feedback["']/],
  ["state recovery", /localStorage|createState\(trip,\s*loadSavedState/],
  ["formal route boundary", /routeGeometry.*dirtyDays|dirtyDays.*routeGeometry/s],
  ["why section", /为什么去/],
  ["plan section", /怎么安排/],
  ["tip section", /注意事项|注意点/],
  ["official link", /官网|预约|officialUrl/],
  ["map link", /Google Maps|google\.com\/maps|mapUrl/],
  ["experience lead", /体验线索|小红书|experienceUrl/],
  ["responsive viewport", /<meta[^>]+name=["']viewport["']/],
  ["mobile layout", /@media\s*\(max-width:\s*820px\)/],
];

for (const [label, pattern] of coreChecks) {
  if (!pattern.test(combined)) coreMissing.push(label);
}

const enhancementChecks = [
  ["同页图片预览", /image-preview|thumbnail|缩略图|同页图片/],
  ["目的地设计变量", /trip-map-public-theme|--trip-accent|design-tokens|design language|目的地设计语言/i],
];
for (const [label, pattern] of enhancementChecks) {
  if (!pattern.test(combined)) enhancementWarnings.push(label);
}

const summary = {
  file: htmlPath,
  coreChecked: coreChecks.length,
  coreMissing: [...new Set(coreMissing)],
  enhancementWarnings,
  syntaxWarnings: syntaxWarnings.filter(Boolean),
};

console.log(JSON.stringify(summary, null, 2));
if (summary.coreMissing.length) process.exit(1);
