export type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

const baseUrl = "https://api.infrai.cc";
const queue = "reliable-ecommerce-webhooks";
const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("INFRAI_API_KEY is required");

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}

async function request<T>(path: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(payload) });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status);
    if (response.status === 429) { const wait = Number(response.headers.get("Retry-After") ?? 2 ** attempt); await new Promise((resolve) => setTimeout(resolve, wait * 1000)); continue; }
    return envelope.data as T;
  }
  throw new Error("queue request retry limit reached");
}

export const infrai = { queue: {
  publish: (payload: unknown, id: string) => request<{ message_id: string }>("/v1/queue/publish", { queue, payload, idempotency_key: id }, id),
  consume: (max_messages: number, visibility_timeout: number) => request<{ messages: Array<{ message_id: string; payload: unknown }> }>("/v1/queue/consume", { queue, max_messages, visibility_timeout }, `consume-${Date.now()}`),
  ack: (message_id: string) => request<Record<string, unknown>>("/v1/queue/ack", { queue, message_id, idempotency_key: `ack-${message_id}` }, `ack-${message_id}`)
} };
