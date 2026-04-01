import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { startCodebaseSync } from "./src/codebase-sync.ts";
import { startGroomer } from "./src/groomer.ts";
import { startPlanner } from "./src/planner.ts";

function checkDependencies(codebasePath: string): void {
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
};

if (!config.apiToken) throw new Error("SHORTCUT_API_TOKEN is required");
if (!config.ownerMemberId) throw new Error("SHORTCUT_OWNER_MEMBER_ID is required");

checkDependencies(config.codebasePath);

console.log(`[shortcut-helper] groomer=${config.enableGroomer ? "on" : "off"} planner=${config.enablePlanner ? "on" : "off"}`);

const stopSync = startCodebaseSync(config.codebasePath);
const stopGroomer = config.enableGroomer ? startGroomer(config) : null;
const stopPlanner = config.enablePlanner ? startPlanner(config) : null;

process.on("SIGINT", () => {
  console.log("\n[shortcut-helper] shutting down");
  stopGroomer?.();
  stopPlanner?.();
  stopSync();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopGroomer?.();
  stopPlanner?.();
  stopSync();
  process.exit(0);
});
