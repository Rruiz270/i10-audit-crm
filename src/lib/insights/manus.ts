const MANUS_BASE_URL = "https://api.manus.ai";

function getApiKey(): string {
  const key = process.env.MANUS_API_KEY;
  if (!key) {
    throw new Error(
      "MANUS_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }
  return key;
}

export type ManusTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ManusTask {
  id: string;
  status: ManusTaskStatus;
  created_at: string;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

export async function listTasks(): Promise<ManusTask[]> {
  const res = await fetch(`${MANUS_BASE_URL}/v1/tasks`, {
    headers: { API_KEY: getApiKey() },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Manus listTasks failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: ManusTask[] };
  return json.data;
}

export async function createTask(input: {
  prompt: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<ManusTask> {
  const res = await fetch(`${MANUS_BASE_URL}/v1/tasks`, {
    method: "POST",
    headers: {
      API_KEY: getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: input.prompt,
      webhook_url: input.webhookUrl,
      metadata: input.metadata,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Manus createTask failed: ${res.status} — ${body}`);
  }
  return res.json();
}
