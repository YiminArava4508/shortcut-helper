import { spawn } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "grooming-skill.md"), "utf8");

const CLI_MODEL_ALIASES: Record<string, string> = {
  "claude-sonnet-4-6": "sonnet",
  "claude-sonnet-4-5": "sonnet",
  "claude-opus-4-6": "opus",
  "claude-opus-4-5": "opus",
  "claude-haiku-3-5": "haiku",
  sonnet: "sonnet",
  opus: "opus",
  haiku: "haiku",
};

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

function writeMcpConfig(apiToken: string): string {
  const config = {
    mcpServers: {
      shortcut: {
        command: "npx",
        args: ["@shortcut/mcp@latest"],
        env: { SHORTCUT_API_TOKEN: apiToken },
      },
    },
  };
  const path = join(tmpdir(), `shortcut-mcp-${process.pid}.json`);
  writeFileSync(path, JSON.stringify(config), "utf8");
  return path;
}

function spawnGroomingSession(
  userPrompt: string,
  modelAlias: string,
  mcpConfigPath: string,
  codebasePath: string,
): Promise<string> {
  const env = { ...process.env };
  delete env["ANTHROPIC_API_KEY"];
  delete env["ANTHROPIC_API_KEY_OLD"];

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      [
        "-p",
        "--output-format", "text",
        "--model", modelAlias,
        "--no-session-persistence",
        "--permission-mode", "bypassPermissions",
        "--settings", '{"thinkingEnabled":false}',
        "--system-prompt", SYSTEM_PROMPT,
        "--mcp-config", mcpConfigPath,
        "--add-dir", codebasePath,
      ],
      { stdio: ["pipe", "pipe", "pipe"], env },
    );

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(out).toString("utf8").trim());
      } else {
        const errText = Buffer.concat(err).toString("utf8").trim();
        const outText = Buffer.concat(out).toString("utf8").trim();
        reject(new Error(`claude exited ${code}: ${errText || outText || "(no output)"}`));
      }
    });
    proc.stdin.end(userPrompt, "utf8");
  });
}

export function startGroomer(config: GroomerConfig): () => void {
  const modelName = config.model.includes("/") ? config.model.split("/")[1] : config.model;
  const modelAlias = CLI_MODEL_ALIASES[modelName] ?? "sonnet";
  const mcpConfigPath = writeMcpConfig(config.apiToken);

  const poll = async () => {
    console.log("[groomer] polling for ungroomed stories...");
    const userPrompt = buildUserPrompt(config.ownerMemberId, config.codebasePath);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await spawnGroomingSession(userPrompt, modelAlias, mcpConfigPath, config.codebasePath);
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
