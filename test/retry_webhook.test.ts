import assert from "node:assert/strict";
import { nextAttempt } from "../src/retry_webhook.js";

const event = { orderId: "o1", kind: "receipt" as const, attempt: 4, destination: "https://example.test/hook" };
assert.equal(nextAttempt(event, true), null);
assert.equal(nextAttempt(event, false)?.attempt, 5);
assert.equal(nextAttempt({ ...event, attempt: 5 }, false), null);
console.log("retry decision test passed");
