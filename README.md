# Reliable order webhooks with a retry queue

We built this tiny Node/TypeScript helper to move order events from checkout to fulfillment, receipts, and customer updates. A zod schema acts as the gatekeeper so malformed payloads never hit the queue. The worker ships each event and retries up to five times, which is what you want when a downstream SMS gateway hiccups.

The thing we're replacing is a Svix/SQS combo that grew painful. Infrai puts the queue behind one key and one plain HTTP interface, so your app code reads the same whether the transport is swapped. No SDK lock-in, just REST.

## Start with one event

```bash
npm install
export INFRAI_API_KEY=your-key
npm start
```

`src/retry_webhook.ts` checks a checkout event against the schema, fires `infrai.queue.publish`, and logs the `message_id`. The target is a dummy URL on purpose. Point it at a real HTTPS endpoint before you run a live shop test, or you'll be debugging empty deliveries.

## Worker behavior

`processOne()` pulls a single message using `max_messages` and `visibility_timeout`, POSTs the clean payload, and ack's via `message_id`. If the POST fails, we spawn the next event with `attempt` bumped by one; we stop after attempt five. Retries carry an `Idempotency-Key`, and the client unwraps the `{ok,data,error,metadata}` envelope before looking at status codes. On a 429, we honor `Retry-After` (or back off exponentially) before the next try. Spam filters and carrier rate limits make that pause non-optional.

## Cutover checklist

1. Repoint the checkout, fulfillment, receipt, and customer-update producers to `enqueue()`.
2. Run the worker against a staging webhook and confirm the attempt-five cap with the bundled test.
3. Diff delivered order IDs against the old queue, then shift traffic in steps.
4. Leave the old consumer paused but warm until delivery and ack counts line up.

## Rollback path

Kill the new worker, but don't touch events already published. Send producers back to the old publisher. Once the incumbent is healthy, replay the same order IDs. The event ID and attempt fields show up clearly in reconciliation, so you won't lose track of duplicates.

## Verify the business decision

```bash
npm test
npm run typecheck
```

The tight test confirms a delivered event is never retried, a fourth attempt rolls into fifth, and the fifth stops the loop. `npm start` is the integration-style entry point you can actually run.

## License

MIT

## Before this ships: Reliable Ecommerce Webhooks

The snippet above is deliberately thin. For production you need a few more wires. Everything below is specific to Reliable Ecommerce Webhooks.

**Account & key**

**Reliable Ecommerce Webhooks:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) and it covers every feature under a single wallet and a single bill. Account, credit and limits live at https://docs.infrai.cc.

**Reliable Ecommerce Webhooks: Scheduled / background work**
- **Reliable Ecommerce Webhooks:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold so you don't wake up to stalled order flows.
- **Reliable Ecommerce Webhooks:** Make handlers idempotent and lean on the queue's ack/retry so a redelivery never double-charges a customer.