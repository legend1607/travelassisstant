#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsonInputUsage, parseJsonInputArgs, readJsonContext } from "./cli-json-input.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 10_000;
const MAX_CONCURRENCY = 4;
const MAX_SOURCES = 100;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function unsafeSourceUrl() {
  return new Error("unsafe source URL");
}

function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== "string") throw unsafeSourceUrl();

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw unsafeSourceUrl();
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw unsafeSourceUrl();
  }
  const requestUrl = parsed.toString();
  parsed.search = "";
  parsed.hash = "";
  return { requestUrl, outputUrl: parsed.toString() };
}

function readBoundedInteger(value, fallback, label, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(label + " must be between 1 and " + maximum);
  }
  return value;
}

function normalizeFallback(source) {
  if (source.fallback !== undefined) {
    return { kind: "url", url: normalizeUrl(source.fallback).outputUrl };
  }
  if (source.access?.fallback === undefined) return undefined;
  const options = source.access.fallback;
  if (!Array.isArray(options) || options.length < 1 || options.some((option) => typeof option !== "string" || !option.trim())) {
    throw new Error("source access fallback must be a non-empty string array");
  }
  return { kind: "options", optionCount: options.length };
}

function normalizeInput(input) {
  if (!input || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error("Probe input must be a JSON object.");
  }
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > MAX_SOURCES) {
    throw new Error("sources must contain between 1 and " + MAX_SOURCES + " items");
  }

  const sourceIds = new Set();
  const sources = input.sources.map((source) => {
    if (!source || Array.isArray(source) || Object.getPrototypeOf(source) !== Object.prototype || !SAFE_ID.test(source.id || "")) {
      throw new Error("source id must use letters, numbers, dots, underscores, or hyphens");
    }
    if (sourceIds.has(source.id)) throw new Error("source ids must be unique");
    sourceIds.add(source.id);
    const url = normalizeUrl(source.url);
    const fallback = normalizeFallback(source);
    return { id: source.id, requestUrl: url.requestUrl, url: url.outputUrl, fallback };
  });

  return {
    sources,
    timeoutMs: readBoundedInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs", MAX_TIMEOUT_MS),
    concurrency: readBoundedInteger(input.concurrency, MAX_CONCURRENCY, "concurrency", MAX_CONCURRENCY),
  };
}

function statusFor(responseStatus) {
  if (responseStatus >= 200 && responseStatus < 300) return "reachable";
  if (responseStatus >= 300 && responseStatus < 400) return "redirected";
  if (responseStatus === 404) return "not-found";
  if (responseStatus === 429) return "rate-limited";
  if (responseStatus >= 400 && responseStatus < 500) return "access-blocked";
  if (responseStatus >= 500 && responseStatus < 600) return "server-error";
  return "network-error";
}

function fallbackResult(fallback, status) {
  if (!fallback) return undefined;
  const fallbackStatus = status === "reachable" ? "available" : "fallback-required";
  if (fallback.kind === "url") return { status: fallbackStatus, url: fallback.url };
  return {
    status: fallbackStatus,
    available: true,
    optionCount: fallback.optionCount,
  };
}

async function cancelBody(response) {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // The response is intentionally never read; cancellation failures are not surfaced.
  }
}

async function requestSource(source, { fetchImpl, timeoutMs }) {
  let method = "HEAD";
  try {
    let response = await fetchImpl(source.requestUrl, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 405 || response.status === 501) {
      await cancelBody(response);
      method = "GET";
      response = await fetchImpl(source.requestUrl, {
        method: "GET",
        headers: { Range: "bytes=0-1023" },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
    await cancelBody(response);
    const status = statusFor(response.status);
    const result = { id: source.id, url: source.url, status, method, httpStatus: response.status };
    const fallback = fallbackResult(source.fallback, status);
    if (fallback) result.fallback = fallback;
    return result;
  } catch {
    const result = { id: source.id, url: source.url, status: "network-error", method, httpStatus: null };
    const fallback = fallbackResult(source.fallback, "network-error");
    if (fallback) result.fallback = fallback;
    return result;
  }
}

async function runBounded(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function probeSources(input, { fetchImpl = globalThis.fetch, now = () => new Date().toISOString() } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function");
  if (typeof now !== "function") throw new Error("now must be a function");
  const normalized = normalizeInput(input);
  const results = await runBounded(normalized.sources, normalized.concurrency, (source) => requestSource(source, {
    fetchImpl,
    timeoutMs: normalized.timeoutMs,
  }));
  return { checkedAt: now(), results };
}

async function main() {
  const command = "probe-source-access.js";
  const argv = process.argv.slice(2);
  const args = parseJsonInputArgs(argv);
  if (args.help) {
    process.stdout.write(JSON.stringify(jsonInputUsage(command), null, 2) + "\n");
    return;
  }
  const stdin = args.mode === "stdin" ? fs.readFileSync(0, "utf8") : "";
  const input = readJsonContext(argv, stdin);
  process.stdout.write(JSON.stringify(await probeSources(input.context), null, 2) + "\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 2;
  });
}
