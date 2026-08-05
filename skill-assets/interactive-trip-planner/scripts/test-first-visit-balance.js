#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const read = (relativePath) => fs.readFileSync(path.join(skillRoot, relativePath), "utf8");

const skill = read("SKILL.md");
const planningWorkflow = read("references/planning-workflow.md");
const sourceVerification = read("references/source-verification.md");
const onlineLogic = read("references/taste-and-source-online-logic.md");

for (const mode of ["first-visit", "return-visit", "landmark-light", "local-only", "balanced-visitor"]) {
  assert.match(planningWorkflow, new RegExp(mode));
}
assert.match(skill, /代表性景点/);
assert.match(planningWorkflow, /至少评估 3 个/);
assert.match(planningWorkflow, /2[–-]4 个代表性主锚点/);
assert.match(planningWorkflow, /重型景点[^\n]*每天最多 1 个/);
assert.match(planningWorkflow, /同方向[^\n]*(市场|居民广场|社区)/);
assert.match(sourceVerification, /著名景点[^\n]*不能[^\n]*游客多/);
assert.match(onlineLogic, /visitor mode/);
assert.match(planningWorkflow, /第一次使用[^\n]*Skill[^\n]*不等于[^\n]*到访/);
assert.match(planningWorkflow, /到访史未知[^\n]*balanced-visitor/);
assert.match(planningWorkflow, /该城市停留段内[^\n]*2[–-]4 个代表性主锚点/);
assert.match(planningWorkflow, /每座[^\n]*至少评估 3 个代表性景点[^\n]*(采用|舍弃)/);
assert.match(planningWorkflow, /同方向当地生活角色[^\n]*(街区咖啡|社区饭馆|传统商业|夜间)/);
console.log("First-visit tourist/local balance contract passed");
