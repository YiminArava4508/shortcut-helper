import { homedir } from "node:os";
import { startCodebaseSync } from "./src/codebase-sync.ts";
import { startGroomer } from "./src/groomer.ts";

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
};

if (!config.apiToken) throw new Error("SHORTCUT_API_TOKEN is required");
if (!config.ownerMemberId) throw new Error("SHORTCUT_OWNER_MEMBER_ID is required");

const stopSync = startCodebaseSync(config.codebasePath);
const stopGroomer = startGroomer(config);

process.on("SIGINT", () => {
  console.log("\n[shortcut-groomer] shutting down");
  stopGroomer();
  stopSync();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopGroomer();
  stopSync();
  process.exit(0);
});
