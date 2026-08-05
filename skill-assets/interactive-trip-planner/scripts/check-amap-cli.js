#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function defaultCommandExists(command, env) {
  const searchPath = String(env.PATH || "");
  return searchPath.split(path.delimiter).filter(Boolean).some((directory) => {
    try {
      fs.accessSync(path.join(directory, command), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function probeAmapCapability({
  env = process.env,
  commandExists = (command) => defaultCommandExists(command, env),
} = {}) {
  const cliAvailable = Boolean(commandExists("amap-gui"));
  const requiredCredentialNames = ["AMAP_KEY", "AMAP_SECURITY_KEY"];
  const missingRequirements = requiredCredentialNames.filter(
    (name) => typeof env[name] !== "string" || !env[name].trim(),
  );
  const credentialsConfigured = missingRequirements.length === 0;
  const status = !cliAvailable
    ? "unavailable"
    : credentialsConfigured
      ? "available"
      : "missing-credentials";
  return {
    status,
    cliAvailable,
    credentialsConfigured,
    missingRequirements,
    routePlanningAvailable: cliAvailable && credentialsConfigured,
    routeVerification: "not-performed",
    mustNotSynthesizeRoutes: true,
    fallback: [
      "使用高德公开网页或 URI 入口人工复核地点和移动关系。",
      "使用其他可访问的公开地图搜索，并明确标记未完成 amap-gui 路网复核。",
    ],
    factBoundary: "能力探测只确认命令存在且所需凭据变量为非空字符串，不输出凭据值，不执行搜索或路线，也不证明任何路线结果。",
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) process.stdout.write(JSON.stringify(probeAmapCapability(), null, 2) + "\n");
