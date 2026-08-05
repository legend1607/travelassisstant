#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const { probeAmapCapability } = await import("./check-amap-cli.js");
const secrets = {
  AMAP_KEY: "never-print-web-key",
  AMAP_SECURITY_KEY: "never-print-security-key",
};

const missingCli = probeAmapCapability({ env: { ...secrets }, commandExists: () => false });
assert.equal(missingCli.status, "unavailable");
assert.equal(missingCli.cliAvailable, false);
assert.equal(missingCli.credentialsConfigured, true);
assert.equal(missingCli.routePlanningAvailable, false);
assert.equal(missingCli.routeVerification, "not-performed");
assert.equal(missingCli.mustNotSynthesizeRoutes, true);
assert.ok(missingCli.fallback.length >= 2);
assert.doesNotMatch(JSON.stringify(missingCli), /never-print/);

const missingCredentials = probeAmapCapability({ env: {}, commandExists: () => true });
assert.equal(missingCredentials.status, "missing-credentials");
assert.equal(missingCredentials.cliAvailable, true);
assert.equal(missingCredentials.credentialsConfigured, false);
assert.equal(missingCredentials.routePlanningAvailable, false);
assert.deepEqual(missingCredentials.missingRequirements, ["AMAP_KEY", "AMAP_SECURITY_KEY"]);

const emptyCredential = probeAmapCapability({
  env: { AMAP_KEY: "", AMAP_SECURITY_KEY: "configured" },
  commandExists: () => true,
});
assert.equal(emptyCredential.status, "missing-credentials");
assert.equal(emptyCredential.credentialsConfigured, false);
assert.deepEqual(emptyCredential.missingRequirements, ["AMAP_KEY"]);

const whitespaceCredentials = probeAmapCapability({
  env: { AMAP_KEY: "   ", AMAP_SECURITY_KEY: "\t\n" },
  commandExists: () => true,
});
assert.equal(whitespaceCredentials.status, "missing-credentials");
assert.equal(whitespaceCredentials.credentialsConfigured, false);
assert.deepEqual(whitespaceCredentials.missingRequirements, ["AMAP_KEY", "AMAP_SECURITY_KEY"]);

const capabilityReady = probeAmapCapability({ env: { ...secrets }, commandExists: () => true });
assert.equal(capabilityReady.status, "available");
assert.equal(capabilityReady.routePlanningAvailable, true);
assert.equal(capabilityReady.routeVerification, "not-performed");
assert.ok(!("route" in capabilityReady), "capability probe must not invent a route result");
assert.doesNotMatch(JSON.stringify(capabilityReady), /never-print/);

const cli = spawnSync(process.execPath, [path.join(scriptDir, "check-amap-cli.js")], {
  encoding: "utf8",
  env: { ...process.env, ...secrets, PATH: "/definitely/missing" },
});
assert.equal(cli.status, 0, cli.stdout + cli.stderr);
const output = JSON.parse(cli.stdout);
assert.equal(output.status, "unavailable");
assert.doesNotMatch(cli.stdout + cli.stderr, /never-print/);
console.log("Amap capability and downgrade contract passed");
