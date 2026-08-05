#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const themesRoot = path.join(skillRoot, "assets", "themes");

const read = (filePath) => fs.readFileSync(filePath, "utf8");
const readJson = (filePath) => JSON.parse(read(filePath));

const assertMarkerSilhouettesHaveDeepCuts = (css, label) => {
  const corners = [[0, 0], [100, 0], [100, 100], [0, 100]];
  for (let index = 0; index < 5; index += 1) {
    const match = css.match(new RegExp(`\\.poi-marker\\.marker-shape-${index}\\s*\\{[^}]*--marker-shape:\\s*polygon\\(([^)]+)\\)`));
    assert.ok(match, `${label} missing marker-shape-${index}`);
    const points = match[1].split(",").map((pair) => pair.trim().split(/\s+/).map((value) => Number.parseFloat(value)));
    assert.ok(points.length >= 6 && points.length <= 7, `${label} marker-shape-${index} must use a legible 6-7 point silhouette`);
    for (const [cornerX, cornerY] of corners) {
      const closest = Math.min(...points.map(([x, y]) => Math.hypot(x - cornerX, y - cornerY)));
      assert.ok(closest >= 18, `${label} marker-shape-${index} is too square near ${cornerX},${cornerY}: ${closest.toFixed(1)}`);
    }
  }
};

const indexPath = path.join(themesRoot, "index.json");
assert.ok(fs.existsSync(indexPath), "missing assets/themes/index.json");

const registry = readJson(indexPath);
assert.equal(registry.version, 1, "theme registry version must be 1");
assert.ok(Array.isArray(registry.themes) && registry.themes.length > 0, "theme registry needs themes");

const themeIds = registry.themes.map((theme) => theme.id);
assert.equal(new Set(themeIds).size, themeIds.length, "theme ids must be unique");

for (const entry of registry.themes) {
  assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `unsafe theme id: ${entry.id}`);
  const themePath = path.join(themesRoot, entry.themePath);
  const cssPath = path.join(themesRoot, entry.cssPath);
  assert.ok(fs.existsSync(themePath), `missing theme JSON: ${entry.themePath}`);
  assert.ok(fs.existsSync(cssPath), `missing theme CSS: ${entry.cssPath}`);

  const theme = readJson(themePath);
  assert.equal(theme.id, entry.id, `theme id mismatch: ${entry.id}`);
  assert.equal(theme.kind, "ui-theme", `theme kind mismatch: ${entry.id}`);
  assert.ok(theme.coreCompatibility.includes("europe-map-direct-v1"), "theme must target canonical Core");
  assert.equal(theme.tokens?.map?.markerVariantStrategy, "stable-poi-id-hash");
  assert.equal(theme.tokens?.map?.markerShapeVariantCount, 5);
  assert.equal(theme.tokens?.map?.markerToneVariantCount, 5);
  for (const group of ["color", "type", "spacing", "radius", "shadow", "component", "map"]) {
    assert.ok(theme.tokens?.[group], `theme ${entry.id} missing tokens.${group}`);
  }

  const css = read(cssPath);
  assert.match(css, /ARCHITECTURAL-COLLAGE-THEME-START/);
  assert.match(css, /--trip-bg:\s*#F7F0DF/i);
  assert.match(css, /--trip-accent:\s*#283E64/i);
  assert.match(css, /--trip-divider-image:\s*url\("data:image\/(?:png|jpeg);base64,/i);
  assert.match(css, /\.leaflet-tile-pane/);
  assert.match(css, /filter:/);
  assert.match(css, /\.poi-detail-list li::before\s*\{[\s\S]*?width:\s*7px;[\s\S]*?height:\s*7px;[\s\S]*?border-radius:\s*50%;[\s\S]*?clip-path:\s*none;/);
  assert.match(css, /\.poi-detail-day-place\.candidate\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*30px;/);
  assert.match(css, /\.poi-detail-day-place\.candidate\s*>\s*\.poi-detail-day-place-spacer\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.poi-marker\.marker-shape-0/);
  assert.match(css, /\.poi-marker\.marker-shape-4/);
  assert.match(css, /\.poi-marker\.marker-tone-0/);
  assert.match(css, /\.poi-marker\.marker-tone-4/);
  assert.match(css, /\.poi-marker\s*\{[\s\S]*?clip-path:\s*none;/);
  assert.match(css, /\.poi-marker-surface\s*\{[\s\S]*?clip-path:\s*var\(--marker-shape\);/);
  assert.match(css, /\.poi-marker\.candidate\s+\.poi-marker-surface\s*\{/);
  assert.match(css, /\.poi-marker\.selected\s+\.poi-marker-surface\s*\{[\s\S]*?background-image:\s*var\(--trip-divider-image\)/);
  assert.match(css, /\.poi-detail-section\s*\{[\s\S]*?padding:\s*0\s+0\s+12px;[\s\S]*?border-bottom:\s*0;/);
  assert.match(css, /\.poi-detail-section:first-of-type\s*\{[\s\S]*?padding-top:\s*16px;/);
  assert.doesNotMatch(css, /\.day-route-marker,\s*li::before,/);
  assert.doesNotMatch(css, /@import|https?:\/\//i, "theme CSS must not add network dependencies");
  assert.doesNotMatch(css, /<script|function\s*\(|localStorage|PUBLIC_TRIP_DATA/i, "theme CSS must not contain Core behavior");
  assert.doesNotMatch(css, /\/Users\/|file:\/\//i, "theme CSS must not contain local paths");
  assertMarkerSilhouettesHaveDeepCuts(css, entry.id);

  assert.ok(Array.isArray(entry.presets) && entry.presets.length > 0, `theme ${entry.id} needs presets`);
  const presetIds = entry.presets.map((preset) => preset.id);
  assert.equal(new Set(presetIds).size, presetIds.length, `preset ids must be unique for ${entry.id}`);
  for (const presetEntry of entry.presets) {
    const presetPath = path.join(themesRoot, presetEntry.path);
    assert.ok(fs.existsSync(presetPath), `missing preset JSON: ${presetEntry.path}`);
    const preset = readJson(presetPath);
    assert.equal(preset.id, presetEntry.id, `preset id mismatch: ${presetEntry.id}`);
    assert.equal(preset.themeId, entry.id, `preset themeId mismatch: ${presetEntry.id}`);
    assert.equal(preset.geometry?.markerVariantStrategy, "stable-poi-id-hash");
    assert.equal(preset.geometry?.markerShapeVariantCount, 5);
    assert.equal(preset.geometry?.markerToneVariantCount, 5);
    for (const color of ["paper", "paperAlt", "ink", "cobalt", "tomato", "olive", "marigold", "raspberry", "line"]) {
      assert.match(preset.palette?.[color] || "", /^#[0-9A-F]{6}$/i, `preset ${preset.id} missing palette.${color}`);
    }
    assert.ok(preset.typography?.title && preset.typography?.ui, `preset ${preset.id} needs font stacks`);
    assert.equal(preset.map?.tileProvider, "openstreetmap-raster", "preset must retain OSM raster");
  }
}

const skill = read(path.join(skillRoot, "SKILL.md"));
const designLanguage = read(path.join(skillRoot, "references", "design-language.md"));
for (const document of [skill, designLanguage]) {
  assert.match(document, /UI theme/i);
  assert.match(document, /旅行叙事主题/);
  assert.match(document, /taste model/i);
  assert.match(document, /assets\/themes\/index\.json/);
}

const presetCount = registry.themes.reduce((count, theme) => count + theme.presets.length, 0);
console.log(`UI theme contract passed: ${registry.themes.length} theme, ${presetCount} preset`);
