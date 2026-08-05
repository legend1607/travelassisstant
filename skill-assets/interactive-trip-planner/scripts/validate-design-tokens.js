#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  return "Usage: node validate-design-tokens.js guides/<trip-slug>/data/design-tokens.json";
}

const filePath = process.argv[2];
if (!filePath || filePath === "--help" || filePath === "-h") {
  console.log(usage());
  process.exit(filePath ? 0 : 1);
}

const tokenPath = path.resolve(filePath);
let tokens;
try {
  tokens = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
} catch (error) {
  console.error(`Cannot read or parse ${tokenPath}: ${error.message}`);
  process.exit(1);
}

const required = {
  color: ["background", "surface", "text", "muted", "accent", "route", "marker", "warning", "line"],
  type: ["fontFamily", "title", "section", "cardTitle", "body", "meta", "button", "popup"],
  spacing: ["xs", "sm", "md", "lg"],
  radius: ["control", "card", "panel"],
  shadow: ["card", "panel", "marker"],
  component: ["sidebarDensity", "buttonStyle", "badgeStyle", "drawerStyle"],
  map: ["markerShape", "routeLine", "assignedMarkerLabel", "candidateMarkerLabel", "draftMarkerLabel"],
};

const errors = [];
const warnings = [];

for (const [group, keys] of Object.entries(required)) {
  if (!tokens[group] || typeof tokens[group] !== "object" || Array.isArray(tokens[group])) {
    errors.push(`missing group: ${group}`);
    continue;
  }
  for (const key of keys) {
    if (tokens[group][key] === undefined || tokens[group][key] === "") {
      errors.push(`missing token: ${group}.${key}`);
    }
  }
}

for (const role of ["title", "section", "cardTitle", "body", "meta", "button", "popup"]) {
  const item = tokens.type?.[role];
  if (!item || typeof item !== "object") continue;
  for (const key of ["size", "lineHeight", "weight"]) {
    if (item[key] === undefined || item[key] === "") errors.push(`missing type token: type.${role}.${key}`);
  }
}

const colorValues = Object.entries(tokens.color || {});
const directFlagLike = colorValues.filter(([, value]) => typeof value === "string" && /^#(00a859|009b3a|ffdf00|002776)$/i.test(value));
if (directFlagLike.length >= 2) {
  warnings.push("Color palette may be using direct flag colors; ensure this is intentional and documented.");
}

const summary = {
  file: tokenPath,
  checkedGroups: Object.keys(required).length,
  errors,
  warnings,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exit(1);
