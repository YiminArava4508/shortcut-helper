import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function startCodebaseSync(codebasePath: string): () => void {
  const pull = async () => {
    try {
      const { stdout, stderr } = await execFileAsync(
        "git",
        ["-C", codebasePath, "pull", "--rebase", "origin", "main"],
        { timeout: 60_000 },
      );
      console.log(`[sync] ${stdout.trim() || "already up to date"}`);
      if (stderr.trim()) console.warn(`[sync] stderr: ${stderr.trim()}`);
    } catch (err) {
      console.warn(`[sync] failed: ${err}`);
    }
  };

  void pull();
  const timer = setInterval(() => void pull(), TWENTY_FOUR_HOURS_MS);

  return () => clearInterval(timer);
}
