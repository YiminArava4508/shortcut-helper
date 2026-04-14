import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getStoriesInDevelopment } from "../lib/shortcut-api.ts";

export type WatcherConfig = {
  apiToken: string;
  ownerMemberId: string;
  pollIntervalMinutes: number;
  inDevStateName: string;
};

function buildSessionName(storyId: number, storyName: string): string {
  const sanitized = storyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `sc-${storyId}-${sanitized}`;
}

// Replicates new-session.sh: sed 's/[^a-zA-Z0-9-]/-/g' | cut -c1-50
function worktreePath(name: string): string {
  const dir = name.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 50);
  return join(homedir(), "Work", "worktrees", dir);
}

function launchWorktreeSession(name: string): void {
  const script = join(homedir(), "new-session.sh");
  const proc = spawn("bash", [script, name], { detached: true, stdio: "ignore" });
  proc.unref();
  console.log(`[watcher] launching session '${name}'`);
}

export function startWatcher(config: WatcherConfig): () => void {
  // Stories seen on the first poll are the baseline — we only react to tickets
  // that transition into "In Development" while the watcher is running.
  const seen = new Set<number>();
  let initialized = false;

  const poll = async () => {
    try {
      const stories = await getStoriesInDevelopment(
        config.apiToken,
        config.ownerMemberId,
        config.inDevStateName,
      );

      if (!initialized) {
        for (const story of stories) seen.add(story.id);
        initialized = true;
        console.log(`[watcher] initialised, ${stories.length} story/stories already in development`);
        return;
      }

      for (const story of stories) {
        if (seen.has(story.id)) continue;
        seen.add(story.id);

        const name = buildSessionName(story.id, story.name);
        if (existsSync(worktreePath(name))) {
          console.log(`[watcher] worktree already exists for '${name}', skipping`);
          continue;
        }

        launchWorktreeSession(name);
      }
    } catch (err) {
      console.error(`[watcher] poll error: ${err}`);
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), config.pollIntervalMinutes * 60 * 1000);

  return () => clearInterval(timer);
}
