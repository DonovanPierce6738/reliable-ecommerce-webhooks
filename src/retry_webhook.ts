import { z } from "zod";
import { infrai } from "./infrai_client.js";

export const orderEvent = z.object({ orderId: z.string().min(1), kind: z.enum(["checkout", "fulfillment", "receipt", "customer_update"]), attempt: z.number().int().nonnegative(), destination: z.string().url() });
export type OrderEvent = z.infer<typeof orderEvent>;

export function nextAttempt(event: OrderEvent, delivered: boolean): OrderEvent | null {
  if (delivered || event.attempt >= 5) return null;
  return { ...event, attempt: event.attempt + 1 };
}

export async function enqueue(event: unknown): Promise<string> {
  const parsed = orderEvent.parse(event);
  const result = await infrai.queue.publish(parsed, `order-${parsed.orderId}-${parsed.kind}-${parsed.attempt}`);
  return result.message_id;
}

export async function processOne(): Promise<void> {
  const batch = await infrai.queue.consume(1, 30);
  for (const message of batch.messages) {
    const event = orderEvent.parse(message.payload);
    const delivered = (await fetch(event.destination, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) })).ok;
    const retry = nextAttempt(event, delivered);
    if (retry) await enqueue(retry);
    await infrai.queue.ack(message.message_id);
  }
}

if (process.argv[1]?.endsWith("retry_webhook.ts")) {
  const sample = { orderId: "ord_1001", kind: "checkout" as const, attempt: 0, destination: "https://shop.example.test/webhooks/orders" };
  enqueue(sample).then((id) => console.log(`queued ${id}`)).catch((error) => { console.error(error); process.exitCode = 1; });
}
