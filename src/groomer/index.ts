import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_MODEL_ALIASES, spawnClaudeSession, writeMcpConfig } from "../lib/spawn-claude.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "skill.md"), "utf8");

export type GroomerConfig = {
  apiToken: string;
  ownerMemberId: string;
  codebasePath: string;
  model: string;
  pollIntervalMinutes: number;
};

function buildUserPrompt(ownerMemberId: string, codebasePath: string): string {
  return `Your owner member ID is: ${ownerMemberId}
The gemini repository is at: ${codebasePath}

Use the Shortcut MCP tools to find all stories in the current iteration assigned to this member. For each story, check if it already has a grooming comment (a comment that starts with a numbered list or contains "No questions generated"). Skip any already-groomed stories.

For each ungroomed story, follow your grooming instructions: read the ticket, explore the gemini repo using your file tools, decide if clarifying questions are needed, and post a comment with the result.`;
}

export function startGroomer(config: GroomerConfig): () => void {
  const modelName = config.model.includes("/") ? config.model.split("/")[1] : config.model;
  const modelAlias = CLI_MODEL_ALIASES[modelName] ?? "sonnet";
  const mcpConfigPath = writeMcpConfig(config.apiToken, "groomer");

  const poll = async () => {
    console.log("[groomer] polling for ungroomed stories...");
    const userPrompt = buildUserPrompt(config.ownerMemberId, config.codebasePath);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await spawnClaudeSession(userPrompt, SYSTEM_PROMPT, modelAlias, mcpConfigPath, config.codebasePath);
        console.log(`[groomer] cycle complete:\n${result}`);
        return;
      } catch (err) {
        lastErr = err;
        const msg = String(err);
        if (attempt < 3 && msg.includes("tool use concurrency")) {
          console.warn(`[groomer] attempt ${attempt} hit concurrency error, retrying in 5s...`);
          await new Promise((r) => setTimeout(r, 5_000));
          continue;
        }
        break;
      }
    }
    console.error(`[groomer] cycle failed: ${lastErr}`);
  };

  void poll();
  const timer = setInterval(() => void poll(), config.pollIntervalMinutes * 60 * 1000);

  return () => {
    clearInterval(timer);
    try { unlinkSync(mcpConfigPath); } catch { /* already gone */ }
  };
}
