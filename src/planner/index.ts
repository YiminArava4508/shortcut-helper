import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GroomerConfig } from "../groomer/index.ts";
import { CLI_MODEL_ALIASES, spawnClaudeSession, writeMcpConfig } from "../lib/spawn-claude.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "skill.md"), "utf8");

function buildUserPrompt(ownerMemberId: string, codebasePath: string): string {
  return `Your owner member ID is: ${ownerMemberId}
The gemini repository is at: ${codebasePath}

Use the Shortcut MCP tools to find all stories in the current iteration assigned to this member that have the "Ready-for-Claude" label.

For each such story, follow your planning instructions: read the ticket and any existing comments, explore the gemini repo using your file tools, write a detailed implementation plan, post it as a comment, and remove the "Ready-for-Claude" label.`;
}

export function startPlanner(config: GroomerConfig): () => void {
  const modelName = config.model.includes("/") ? config.model.split("/")[1] : config.model;
  const modelAlias = CLI_MODEL_ALIASES[modelName] ?? "sonnet";
  const mcpConfigPath = writeMcpConfig(config.apiToken, "planner");

  const poll = async () => {
    console.log("[planner] polling for Ready-for-Claude stories...");
    const userPrompt = buildUserPrompt(config.ownerMemberId, config.codebasePath);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await spawnClaudeSession(userPrompt, SYSTEM_PROMPT, modelAlias, mcpConfigPath, config.codebasePath);
        console.log(`[planner] cycle complete:\n${result}`);
        return;
      } catch (err) {
        lastErr = err;
        const msg = String(err);
        if (attempt < 3 && msg.includes("tool use concurrency")) {
          console.warn(`[planner] attempt ${attempt} hit concurrency error, retrying in 5s...`);
          await new Promise((r) => setTimeout(r, 5_000));
          continue;
        }
        break;
      }
    }
    console.error(`[planner] cycle failed: ${lastErr}`);
  };

  void poll();
  const timer = setInterval(() => void poll(), config.pollIntervalMinutes * 60 * 1000);

  return () => {
    clearInterval(timer);
    try { unlinkSync(mcpConfigPath); } catch { /* already gone */ }
  };
}
