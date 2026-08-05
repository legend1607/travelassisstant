#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function loadTasteRegistry({ skillRoot = defaultSkillRoot } = {}) {
  const root = path.join(skillRoot, "assets", "taste-models");
  const registry = readJson(path.join(root, "index.json"));
  return {
    ...registry,
    models: registry.models.map((entry) => ({
      ...entry,
      model: readJson(path.join(root, entry.path, "model.json")),
    })),
  };
}

function normalizeTerms(values) {
  return new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean));
}

const vocabularyFields = [
  ["destinationContexts", "destinationContexts"],
  ["playStyles", "playStyles"],
  ["paces", "pace"],
  ["companions", "companions"],
  ["interests", "interests"],
];

export function getTasteInputVocabulary({ skillRoot = defaultSkillRoot } = {}) {
  const registry = loadTasteRegistry({ skillRoot });
  return Object.fromEntries(vocabularyFields.map(([vocabularyField]) => [
    vocabularyField,
    [...new Set(registry.models.flatMap((entry) => entry.model.applicability[vocabularyField]))],
  ]));
}

function contextTerms(context, field) {
  return normalizeTerms(context[field]);
}

function unknownTerms(context, vocabulary) {
  return Object.fromEntries(vocabularyFields.map(([vocabularyField, contextField]) => {
    const known = new Set(vocabulary[vocabularyField].map((value) => value.toLowerCase()));
    return [vocabularyField, [...contextTerms(context, contextField)].filter((value) => !known.has(value))];
  }));
}

function matchScore(model, context, vocabulary) {
  const fields = [
    ["destinationContexts", "destinationContexts"],
    ["playStyles", "playStyles"],
    ["paces", "pace"],
    ["companions", "companions"],
    ["interests", "interests"],
  ];
  return fields.reduce((total, [field, contextField]) => {
    const vocabularyTerms = new Set(vocabulary[field].map((value) => value.toLowerCase()));
    const wanted = [...contextTerms(context, contextField)].filter((value) => vocabularyTerms.has(value));
    return total + model.applicability[field].filter((value) => wanted.includes(value.toLowerCase())).length;
  }, 0);
}

export function recommendTasteModels(context = {}, { skillRoot = defaultSkillRoot } = {}) {
  if (context.useTasteModel === false) {
    return {
      mode: "none",
      recommendations: [],
      explanation: "不使用现成模板，直接按这次旅行的明确偏好规划。",
    };
  }
  const registry = loadTasteRegistry({ skillRoot });
  const inputVocabulary = getTasteInputVocabulary({ skillRoot });
  const ranked = registry.models
    .map((entry, index) => ({ entry, index, score: matchScore(entry.model, context, inputVocabulary) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const matching = ranked.filter((item) => item.score > 0);
  const suppliedUnknownTerms = unknownTerms(context, inputVocabulary);
  if (!matching.length) {
    return {
      mode: "needs-clarification",
      destination: context.destination || null,
      recommendations: [],
      explanation: "当前没有可与已知模板匹配的有效偏好，请先确认玩法、节奏、同行人或兴趣。",
      unknownTerms: suppliedUnknownTerms,
      inputVocabulary,
    };
  }
  const selected = matching.slice(0, registry.selectionContract.maxRecommendations);
  return {
    mode: "recommended",
    destination: context.destination || null,
    recommendations: selected.map(({ entry }) => ({
      id: entry.id,
      name: entry.model.name,
      why: entry.model.recommendation.why,
      tradeoff: entry.model.recommendation.tradeoff,
    })),
    unknownTerms: suppliedUnknownTerms,
    inputVocabulary,
  };
}

export function composeTasteSelection(selection, { skillRoot = defaultSkillRoot } = {}) {
  const registry = loadTasteRegistry({ skillRoot });
  const ids = new Set(registry.models.map((entry) => entry.id));
  if (!selection || !ids.has(selection.primary)) throw new Error("primary model is required and must exist");
  if (!selection.secondary) {
    return {
      mode: "single",
      primary: selection.primary,
      primaryOwns: { placeSelection: true, pace: true },
    };
  }
  if (!ids.has(selection.secondary) || selection.secondary === selection.primary) {
    throw new Error("secondary model must exist and differ from primary");
  }
  const contribution = selection.secondaryContribution;
  if (!contribution || Array.isArray(contribution) || typeof contribution !== "object") {
    throw new Error("hybrid selection requires exactly one contribution");
  }
  const allowed = registry.selectionContract.hybrid.secondaryContributionTypes;
  if (!allowed.includes(contribution.type) || typeof contribution.value !== "string" || !contribution.value.trim()) {
    throw new Error("hybrid selection requires exactly one domain or visual contribution");
  }
  return {
    mode: "hybrid",
    primary: selection.primary,
    secondary: selection.secondary,
    primaryOwns: { placeSelection: true, pace: true },
    secondaryContribution: { type: contribution.type, value: contribution.value.trim() },
  };
}
