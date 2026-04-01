import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GroomerConfig } from "../groomer/index.ts";
import { getReadyForClaudeStories, removeLabelFromStory } from "../lib/shortcut-api.ts";
import { CLI_MODEL_ALIASES, spawnClaudeSession, writeMcpConfig } from "../lib/spawn-claude.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "skill.md"), "utf8");

function buildUserPrompt(codebasePath: string, storyIds: number[]): string {
  return `The gemini repository is at: ${codebasePath}

The following Shortcut story IDs need implementation plans: ${storyIds.join(", ")}

For each story ID, follow your planning instructions: fetch the story details using the Shortcut MCP, read the ticket and any existing comments, explore the gemini repo using your file tools, write a detailed implementation plan, and post it as a comment.`;
}

export function startPlanner(config: GroomerConfig): () => void {
  const modelName = config.model.includes("/") ? config.model.split("/")[1] : config.model;
  const modelAlias = CLI_MODEL_ALIASES[modelName] ?? "sonnet";
  const mcpConfigPath = writeMcpConfig(config.apiToken, "planner");

  let running = false;

  const poll = async () => {
    if (running) {
      console.log("[planner] previous cycle still running, skipping");
      return;
    }
    running = true;
    try {
      console.log("[planner] polling for Ready-for-Claude stories...");

      const stories = await getReadyForClaudeStories(config.apiToken, config.ownerMemberId);
      if (stories.length === 0) {
        console.log("[planner] no Ready-for-Claude stories found");
        return;
      }

      const storyIds = stories.map((s) => s.id);
      console.log(`[planner] found ${stories.length} story/stories: ${storyIds.join(", ")}`);

      const userPrompt = buildUserPrompt(config.codebasePath, storyIds);
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await spawnClaudeSession(userPrompt, SYSTEM_PROMPT, modelAlias, mcpConfigPath, config.codebasePath);
          console.log(`[planner] cycle complete:\n${result}`);

          for (const story of stories) {
            try {
              await removeLabelFromStory(config.apiToken, story.id, "Ready-for-Claude");
              console.log(`[planner] removed Ready-for-Claude label from story ${story.id}`);
            } catch (err) {
              console.error(`[planner] failed to remove label from story ${story.id}: ${err}`);
            }
          }
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
    } finally {
      running = false;
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), config.pollIntervalMinutes * 60 * 1000);

  return () => {
    clearInterval(timer);
    try { unlinkSync(mcpConfigPath); } catch { /* already gone */ }
  };
}
