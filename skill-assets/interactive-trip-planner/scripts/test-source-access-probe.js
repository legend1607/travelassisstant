#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { probeSources } from "./probe-source-access.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-trip-planner-source-probe-"));
const requests = { fallback: 0, headUnsupportedRange: "", active: 0, maxActive: 0 };

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  const pathname = requestUrl.pathname;
  const finish = (statusCode, headers, body = "") => {
    response.writeHead(statusCode, headers);
    response.end(body);
  };

  if (pathname === "/ok") {
    requests.okUrl = request.url;
    return finish(200, { "content-type": "text/plain" }, "ok");
  }
  if (pathname === "/redirect") return finish(302, { location: "/ok?token=redirect-secret" });
  if (pathname === "/not-found") return finish(404, {});
  if (pathname === "/blocked") return finish(403, {});
  if (pathname === "/auth-required") return finish(401, {});
  if (pathname === "/proxy-auth-required") return finish(407, {});
  if (pathname === "/client-error") return finish(422, {});
  if (pathname === "/limited") return finish(429, {});
  if (pathname === "/error") return finish(503, {});
  if (pathname === "/body-secret") return finish(200, { "content-type": "text/plain" }, "body-secret-value");
  if (pathname === "/fallback") {
    requests.fallback += 1;
    return finish(200, {});
  }
  if (pathname === "/head-unsupported") {
    if (request.method === "HEAD") return finish(405, {});
    requests.headUnsupportedRange = String(request.headers.range || "");
    return finish(206, { "content-range": "bytes 0-3/4" }, "body-secret-value");
  }
  if (pathname === "/slow") {
    const timeout = setTimeout(() => finish(200, {}), 200);
    request.on("close", () => clearTimeout(timeout));
    return;
  }
  if (pathname.startsWith("/concurrency-")) {
    requests.active += 1;
    requests.maxActive = Math.max(requests.maxActive, requests.active);
    const timeout = setTimeout(() => {
      requests.active -= 1;
      finish(200, {});
    }, 30);
    request.on("close", () => clearTimeout(timeout));
    return;
  }
  finish(404, {});
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function runCli(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDir, "probe-source-access.js"), ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill(), 2_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

try {
  const port = await listen();
  const baseUrl = `http://127.0.0.1:${port}`;
  const input = {
    sources: [
      { id: "ok", url: baseUrl + "/ok?token=query-secret#fragment-secret", fallback: baseUrl + "/fallback?token=fallback-secret" },
      { id: "redirect", url: baseUrl + "/redirect" },
      { id: "missing", url: baseUrl + "/not-found", fallback: baseUrl + "/fallback?token=missing-fallback-secret#fragment" },
      { id: "blocked", url: baseUrl + "/blocked" },
      { id: "authRequired", url: baseUrl + "/auth-required" },
      { id: "clientError", url: baseUrl + "/client-error" },
      { id: "limited", url: baseUrl + "/limited" },
      { id: "error", url: baseUrl + "/error" },
      { id: "headUnsupported", url: baseUrl + "/head-unsupported" },
      { id: "slow", url: baseUrl + "/slow" },
      { id: "bodySecret", url: baseUrl + "/body-secret" },
    ],
    timeoutMs: 100,
    concurrency: 2,
  };
  const result = await probeSources(input, { now: () => "2026-08-01T00:00:00.000Z" });
  const byId = Object.fromEntries(result.results.map((item) => [item.id, item]));

  assert.equal(result.checkedAt, "2026-08-01T00:00:00.000Z");
  assert.equal(byId.ok.status, "reachable");
  assert.equal(byId.redirect.status, "redirected");
  assert.equal(byId.missing.status, "not-found");
  assert.equal(byId.blocked.status, "access-blocked");
  assert.equal(byId.authRequired.status, "access-blocked");
  assert.equal(byId.clientError.status, "access-blocked");
  assert.equal(byId.limited.status, "rate-limited");
  assert.equal(byId.error.status, "server-error");
  assert.equal(byId.slow.status, "network-error");
  assert.equal(byId.headUnsupported.method, "GET");
  assert.equal(byId.ok.url, baseUrl + "/ok");
  assert.equal(byId.ok.httpStatus, 200);
  assert.equal(byId.redirect.httpStatus, 302);
  assert.equal(byId.missing.httpStatus, 404);
  assert.equal(byId.blocked.httpStatus, 403);
  assert.equal(byId.authRequired.httpStatus, 401);
  assert.equal(byId.clientError.httpStatus, 422);
  assert.equal(byId.limited.httpStatus, 429);
  assert.equal(byId.error.httpStatus, 503);
  assert.equal(byId.headUnsupported.httpStatus, 206);
  assert.equal(byId.slow.httpStatus, null);
  assert.deepEqual(byId.ok.fallback, { status: "available", url: baseUrl + "/fallback" });
  assert.deepEqual(byId.missing.fallback, { status: "fallback-required", url: baseUrl + "/fallback" });
  assert.equal(requests.okUrl, "/ok?token=query-secret");
  assert.equal(requests.headUnsupportedRange, "bytes=0-1023");
  assert.equal(requests.fallback, 0);
  assert.doesNotMatch(JSON.stringify(result), /body-secret-value|query-secret|fallback-secret|Authorization/i);

  const proxyAuthResult = await probeSources({
    sources: [{ id: "proxyAuthRequired", url: baseUrl + "/proxy-auth-required" }],
  }, {
    fetchImpl: async () => ({ status: 407, body: null }),
    now: () => "2026-08-01T00:00:00.000Z",
  });
  assert.equal(proxyAuthResult.results[0].status, "access-blocked");
  assert.equal(proxyAuthResult.results[0].httpStatus, 407);

  const globalPack = JSON.parse(fs.readFileSync(
    path.join(scriptDir, "..", "assets", "source-packs", "global-base.json"),
    "utf8",
  ));
  const formalSource = globalPack.sources[0];
  const formalAvailable = await probeSources({
    sources: [{ ...formalSource, url: baseUrl + "/ok" }],
  }, { now: () => "2026-08-01T00:00:00.000Z" });
  assert.deepEqual(formalAvailable.results[0].fallback, {
    status: "available",
    available: true,
    optionCount: formalSource.access.fallback.length,
  });
  const formalRequired = await probeSources({
    sources: [{ ...formalSource, url: baseUrl + "/not-found" }],
  }, { now: () => "2026-08-01T00:00:00.000Z" });
  assert.deepEqual(formalRequired.results[0].fallback, {
    status: "fallback-required",
    available: true,
    optionCount: formalSource.access.fallback.length,
  });
  assert.doesNotMatch(JSON.stringify([formalAvailable, formalRequired]), new RegExp(formalSource.access.fallback[0]));

  await assert.rejects(
    probeSources({ sources: [{ id: "ftp", url: "ftp://127.0.0.1/ignored" }] }),
    /unsafe source URL/,
  );
  await assert.rejects(
    probeSources({ sources: [{ id: "credential", url: "https://user:pass@example.com/ignored" }] }),
    /unsafe source URL/,
  );
  await assert.rejects(
    probeSources({ sources: [{ id: "malformed", url: "http://[invalid" }] }),
    /unsafe source URL/,
  );
  await assert.rejects(
    probeSources({ sources: [{ id: "unsafe-fallback", url: baseUrl + "/ok", fallback: "ftp://127.0.0.1/ignored" }] }),
    /unsafe source URL/,
  );
  await assert.rejects(
    probeSources({ sources: [{ id: "too-many", url: baseUrl + "/ok" }], concurrency: 5 }),
    /concurrency must be between 1 and 4/,
  );

  await probeSources({
    sources: Array.from({ length: 4 }, (_, index) => ({ id: "concurrency-" + index, url: baseUrl + "/concurrency-" + index })),
    concurrency: 2,
  });
  assert.ok(requests.maxActive <= 2, "probe exceeded requested concurrency");

  const inputPath = path.join(tempDir, "sources.json");
  fs.writeFileSync(inputPath, JSON.stringify({ sources: [{ id: "cli", url: baseUrl + "/ok?token=cli-secret" }] }));
  const fileRun = await runCli(["--context", inputPath]);
  assert.equal(fileRun.status, 0, fileRun.stderr);
  assert.equal(fileRun.stderr, "");
  assert.equal(JSON.parse(fileRun.stdout).results[0].url, baseUrl + "/ok");
  assert.doesNotMatch(fileRun.stdout, /cli-secret/);

  const stdinRun = await runCli(["--stdin"], JSON.stringify({ sources: [{ id: "stdin", url: baseUrl + "/ok" }] }));
  assert.equal(stdinRun.status, 0, stdinRun.stderr);
  assert.equal(JSON.parse(stdinRun.stdout).results[0].status, "reachable");
  assert.equal(stdinRun.stderr, "");

  const helpRun = await runCli(["--help"]);
  assert.equal(helpRun.status, 0, helpRun.stderr);
  assert.deepEqual(JSON.parse(helpRun.stdout), {
    status: "usage",
    usage: "Usage: probe-source-access.js (--context <file> | --stdin)",
  });
  assert.equal(helpRun.stderr, "");

  const badRun = await runCli(["--stdin"], JSON.stringify({ sources: [{ id: "bad", url: "https://user:pass@example.com/?token=cli-secret" }] }));
  assert.equal(badRun.status, 2);
  assert.equal(badRun.stdout, "");
  assert.match(badRun.stderr, /unsafe source URL/);
  assert.doesNotMatch(badRun.stderr, /user:pass|token=|cli-secret/);
} finally {
  await close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Source access probe contract passed");
