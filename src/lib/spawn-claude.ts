import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CLI_MODEL_ALIASES: Record<string, string> = {
  "claude-sonnet-4-6": "sonnet",
  "claude-sonnet-4-5": "sonnet",
  "claude-opus-4-6": "opus",
  "claude-opus-4-5": "opus",
  "claude-haiku-3-5": "haiku",
  sonnet: "sonnet",
  opus: "opus",
  haiku: "haiku",
};

export function writeMcpConfig(apiToken: string, suffix: string): string {
  const config = {
    mcpServers: {
      shortcut: {
        command: "npx",
        args: ["@shortcut/mcp@latest"],
        env: { SHORTCUT_API_TOKEN: apiToken },
      },
    },
  };
  const path = join(tmpdir(), `shortcut-mcp-${process.pid}-${suffix}.json`);
  writeFileSync(path, JSON.stringify(config), { encoding: "utf8", mode: 0o600 });
  return path;
}

export function spawnClaudeSession(
  userPrompt: string,
  systemPrompt: string,
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
        "--system-prompt", systemPrompt,
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
