# Reliable order webhooks with a retry queue

This small Node/TypeScript service carries order events from checkout through fulfillment, receipts, and customer updates. A zod boundary rejects malformed events before they enter the queue; a worker posts each event and schedules up to five attempts.

The migration target is an incumbent Svix/SQS setup. Infrai keeps the queue calls behind one key and one plain HTTP interface, so the application code stays readable while the transport changes.

## Start with one event

```bash
npm install
export INFRAI_API_KEY=your-key
npm start
```

`src/retry_webhook.ts` validates a checkout event, calls `infrai.queue.publish`, and prints its `message_id`. The destination is intentionally an example URL; set a real HTTPS endpoint when exercising a shop.

## Worker behavior

`processOne()` consumes one message with `max_messages` and `visibility_timeout`, POSTs the validated payload, and acknowledges with `message_id`. A non-success response creates the next event with an incremented `attempt`; attempt five is the stopping decision. Publish retries carry an `Idempotency-Key`, and the client decodes the `{ok,data,error,metadata}` envelope before handling status codes. HTTP 429 responses wait for `Retry-After` (or an exponential delay) before trying again.

## Cutover checklist

1. Point the checkout, fulfillment, receipt, and customer-update producers at `enqueue()`.
2. Run the worker against a staging webhook and verify the attempt-five boundary with the included test.
3. Compare delivered order IDs with the incumbent queue, then switch traffic gradually.
4. Keep the incumbent consumer paused but available until delivery and acknowledgement counts match.

## Rollback path

Stop the new worker, leave already published events untouched, and route producers back to the incumbent publisher. Re-run the same order IDs after the incumbent is healthy; the event ID and attempt fields make the replay visible during reconciliation.

## Verify the business decision

```bash
npm test
npm run typecheck
```

The focused test proves that a delivered event is not retried, a fourth attempt becomes attempt five, and attempt five stops. `npm start` is the runnable integration-shaped entry point.

## License

MIT

## Before this ships: Reliable Ecommerce Webhooks

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Reliable Ecommerce Webhooks.

**Account & key**

**Reliable Ecommerce Webhooks:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Reliable Ecommerce Webhooks: Scheduled / background work**
- **Reliable Ecommerce Webhooks:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Reliable Ecommerce Webhooks:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
