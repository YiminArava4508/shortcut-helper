import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { startGroomer } from "./src/groomer/index.ts";
import { pullCodebase } from "./src/lib/codebase-sync.ts";
import { startPlanner } from "./src/planner/index.ts";
import { startWatcher } from "./src/watcher/index.ts";

function checkDependencies(apiToken: string, ownerMemberId: string, codebasePath: string): void {
  if (!apiToken) throw new Error("SHORTCUT_API_TOKEN is required");
  if (!ownerMemberId) throw new Error("SHORTCUT_OWNER_MEMBER_ID is required");

  try {
    execFileSync("which", ["claude"], { stdio: "ignore" });
  } catch {
    throw new Error("claude CLI is not installed or not in PATH. Install it from https://claude.ai/code");
  }

  try {
    execFileSync("which", ["npx"], { stdio: "ignore" });
  } catch {
    throw new Error("npx is not available. Install Node.js from https://nodejs.org");
  }

  if (!existsSync(codebasePath)) {
    throw new Error(`CODEBASE_PATH does not exist: ${codebasePath}`);
  }

  try {
    execFileSync("git", ["-C", codebasePath, "rev-parse", "--git-dir"], { stdio: "ignore" });
  } catch {
    throw new Error(`CODEBASE_PATH is not a git repository: ${codebasePath}`);
  }
}

const pollIntervalMinutes = Number(process.env.POLL_INTERVAL_MINUTES ?? "3");
if (!Number.isFinite(pollIntervalMinutes) || pollIntervalMinutes <= 0) {
  throw new Error("POLL_INTERVAL_MINUTES must be a positive number");
}

const config = {
  apiToken: process.env.SHORTCUT_API_TOKEN ?? "",
  ownerMemberId: process.env.SHORTCUT_OWNER_MEMBER_ID ?? "",
  codebasePath: process.env.CODEBASE_PATH ?? `${homedir()}/Work/gemini`,
  model: process.env.GROOMER_MODEL ?? "claude-sonnet-4-6",
  pollIntervalMinutes,
  enableGroomer: process.env.ENABLE_GROOMER === "true",
  enablePlanner: process.env.ENABLE_PLANNER === "true",
  enableWatcher: process.env.ENABLE_WATCHER === "true",
  inDevStateName: process.env.IN_DEVELOPMENT_STATE_NAME ?? "In Development",
};

checkDependencies(config.apiToken, config.ownerMemberId, config.codebasePath);

console.log(`[shortcut-helper] groomer=${config.enableGroomer ? "on" : "off"} planner=${config.enablePlanner ? "on" : "off"} watcher=${config.enableWatcher ? "on" : "off"}`);

const stopGroomer = config.enableGroomer ? startGroomer(config) : null;
const stopPlanner = config.enablePlanner ? startPlanner(config) : null;
const stopWatcher = config.enableWatcher ? startWatcher(config) : null;

void pullCodebase(config.codebasePath);
const syncTimer = setInterval(() => void pullCodebase(config.codebasePath), config.pollIntervalMinutes * 60 * 1000);

process.on("SIGINT", () => {
  console.log("\n[shortcut-helper] shutting down");
  clearInterval(syncTimer);
  stopGroomer?.();
  stopPlanner?.();
  stopWatcher?.();
  process.exit(0);
});

process.on("SIGTERM", () => {
  clearInterval(syncTimer);
  stopGroomer?.();
  stopPlanner?.();
  stopWatcher?.();
  process.exit(0);
});
