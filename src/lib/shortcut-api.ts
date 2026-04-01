const BASE_URL = "https://api.app.shortcut.com/api/v3";

type Label = { id: number; name: string };

export type Story = {
  id: number;
  name: string;
  labels: Label[];
  owner_ids: string[];
};

type Iteration = {
  id: number;
  status: string;
};

async function request<T>(apiToken: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Shortcut-Token": apiToken,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Shortcut API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function getCurrentIteration(apiToken: string): Promise<Iteration> {
  const iterations = await request<Iteration[]>(apiToken, "/iterations?page_size=25");
  const current = iterations.find((i) => i.status === "started");
  if (!current) throw new Error("No active iteration found");
  return current;
}

export async function getReadyForClaudeStories(apiToken: string, ownerMemberId: string): Promise<Story[]> {
  const iteration = await getCurrentIteration(apiToken);
  const stories = await request<Story[]>(apiToken, `/iterations/${iteration.id}/stories`);
  return stories.filter(
    (s) =>
      s.owner_ids.includes(ownerMemberId) &&
      s.labels.some((l) => l.name === "Ready-for-Claude"),
  );
}

export async function removeLabelFromStory(apiToken: string, storyId: number, labelName: string): Promise<void> {
  const story = await request<Story>(apiToken, `/stories/${storyId}`);
  const updatedLabels = story.labels
    .filter((l) => l.name !== labelName)
    .map((l) => ({ name: l.name }));
  await request(apiToken, `/stories/${storyId}`, {
    method: "PUT",
    body: JSON.stringify({ labels: updatedLabels }),
  });
}
