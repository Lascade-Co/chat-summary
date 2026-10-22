import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { freezeEnvelope, holdUntil, idempotencyKey, sendFrozen } from "../src/delivery.js";

const payload = {
  from: "Sender <sender@example.test>",
  to: ["recipient@example.test"],
  subject: "Private subject · Tue, Oct 21 — 2 chats",
  html: "<p>Private customer summary</p>",
  text: "Private customer summary",
};

async function envelope(t, body = payload) {
  const directory = await mkdtemp(resolve(".delivery-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "frozen-product-pt.json");
  await freezeEnvelope(file, { key: "chat-summary/SHEET_ID/2026-10-21/pt", payload: body });
  return file;
}

function response(status, name = "", message = "Private customer summary") {
  return new Response(JSON.stringify({ name, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("production and test keys are isolated across products, tabs and editions", () => {
  const input = { sheetIdEnv: "TA_SHEET_ID", tab: "2026-10-21", edition: "pt" };
  assert.equal(idempotencyKey(input), "chat-summary/TA_SHEET_ID/2026-10-21/pt");
  assert.equal(idempotencyKey({ ...input, edition: "ist" }), "chat-summary/TA_SHEET_ID/2026-10-21/ist");
  assert.equal(idempotencyKey({ ...input, sheetIdEnv: "MARINE_SHEET_ID" }), "chat-summary/MARINE_SHEET_ID/2026-10-21/pt");
  assert.equal(idempotencyKey({ ...input, tab: "2026-10-22" }), "chat-summary/TA_SHEET_ID/2026-10-22/pt");
  assert.equal(idempotencyKey({ ...input, testTo: "test@example.test", runId: "123" }), "chat-summary/test/TA_SHEET_ID/2026-10-21/pt/123");
  assert.equal(idempotencyKey({ ...input, testTo: "changed@example.test", runId: "123" }), "chat-summary/test/TA_SHEET_ID/2026-10-21/pt/123");
  assert.throws(() => idempotencyKey({ ...input, testTo: "test@example.test" }), /run id/i);
});

test("frozen envelope refuses replacement and keeps private file permissions", async t => {
  const file = await envelope(t);
  const original = await readFile(file);
  await assert.rejects(
    freezeEnvelope(file, { key: "changed", payload: { ...payload, subject: "replacement" } }),
    /already exists/i,
  );
  assert.deepEqual(await readFile(file), original);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test("freezing rejects scheduled delivery fields", async t => {
  await assert.rejects(envelope(t, { ...payload, scheduled_at: "2026-10-21T12:55:00Z" }), /scheduled/i);
});

test("ambiguous POST retries the exact frozen bytes and idempotency key", async t => {
  const file = await envelope(t);
  const submissions = [];
  const delays = [];
  const result = await sendFrozen(file, {
    apiKey: "secret-test-key",
    sleep: async ms => { delays.push(ms); },
    fetchImpl: async (url, options) => {
      submissions.push({ url, ...options, headers: { ...options.headers } });
      if (submissions.length === 1) {
        // Even a later on-disk change cannot alter this invocation's retries.
        await writeFile(file, JSON.stringify({ key: "changed", body: "{}" }));
        throw new Error("Private subject and recipient@example.test in network error");
      }
      return response(200);
    },
  });
  assert.deepEqual(result, { accepted: true, status: 200, attempts: 2 });
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].url, "https://api.resend.com/emails");
  assert.equal(submissions[0].method, "POST");
  assert.equal(submissions[0].headers.Authorization, "Bearer secret-test-key");
  assert.equal(submissions[0].headers["Content-Type"], "application/json");
  assert.equal(submissions[0].body, '{"from":"Sender <sender@example.test>","to":["recipient@example.test"],"subject":"Private subject · Tue, Oct 21 — 2 chats","html":"<p>Private customer summary</p>","text":"Private customer summary"}');
  assert.equal(submissions[1].body, submissions[0].body);
  assert.equal(submissions[0].headers["Idempotency-Key"], "chat-summary/SHEET_ID/2026-10-21/pt");
  assert.equal(submissions[1].headers["Idempotency-Key"], submissions[0].headers["Idempotency-Key"]);
  assert.equal(delays.length, 1);
  assert.ok(delays[0] > 0 && delays[0] <= 60000);
});

test("a fresh-run changed payload fails closed on invalid idempotency conflict", async t => {
  const firstFile = await envelope(t);
  const rebuiltFile = await envelope(t, { ...payload, html: "<p>A changed summary</p>" });
  let acceptedBody;
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    if (!acceptedBody) {
      acceptedBody = options.body;
      return response(200);
    }
    assert.notEqual(options.body, acceptedBody);
    return response(409, "invalid_idempotent_request");
  };
  await sendFrozen(firstFile, { apiKey: "secret-test-key", fetchImpl });
  await assert.rejects(sendFrozen(rebuiltFile, {
    apiKey: "secret-test-key", fetchImpl,
    sleep: async () => assert.fail("Invalid idempotency conflicts must not retry"),
  }), error => {
    assert.match(error.message, /409.*invalid_idempotent_request/);
    assert.doesNotMatch(error.message, /Private|recipient|changed summary/);
    return true;
  });
  assert.equal(calls, 2);
});

test("concurrent idempotency conflicts retry with bounded backoff", async t => {
  const file = await envelope(t);
  const delays = [];
  let attempts = 0;
  const result = await sendFrozen(file, {
    apiKey: "secret-test-key",
    sleep: async ms => { delays.push(ms); },
    fetchImpl: async () => ++attempts < 3
      ? response(409, "concurrent_idempotent_requests")
      : response(200),
  });
  assert.equal(result.accepted, true);
  assert.equal(attempts, 3);
  assert.equal(delays.length, 2);
  assert.ok(delays.every(ms => ms > 0 && ms <= 60000));
  assert.ok(delays[1] >= delays[0]);
});

for (const status of [201, 202, 400, 401, 409]) {
  test(`HTTP ${status} never records acceptance`, async t => {
    const file = await envelope(t);
    let calls = 0;
    await assert.rejects(sendFrozen(file, {
      apiKey: "secret-test-key",
      sleep: async () => assert.fail("A permanent status must not retry"),
      fetchImpl: async () => { calls += 1; return response(status); },
    }), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /Private|recipient/);
      return true;
    });
    assert.equal(calls, 1);
  });
}

for (const status of [429, 500, 503]) {
  test(`HTTP ${status} retries until the bounded attempt limit without accepting`, async t => {
    const file = await envelope(t);
    let calls = 0;
    const delays = [];
    await assert.rejects(sendFrozen(file, {
      apiKey: "secret-test-key", maxAttempts: 3,
      sleep: async ms => { delays.push(ms); },
      fetchImpl: async () => { calls += 1; return response(status); },
    }), /failed/i);
    assert.equal(calls, 3);
    assert.equal(delays.length, 2);
  });
}

test("transport exceptions cannot leak response content or recipient data", async t => {
  const file = await envelope(t);
  await assert.rejects(sendFrozen(file, {
    apiKey: "secret-test-key", maxAttempts: 1,
    fetchImpl: async () => { throw new Error("Private subject recipient@example.test"); },
  }), error => {
    assert.match(error.message, /transport/i);
    assert.doesNotMatch(String(error.stack), /Private|recipient@example|secret-test-key/);
    return true;
  });
});

test("malformed frozen input fails before making a request without exposing its contents", async t => {
  const file = await envelope(t);
  await writeFile(file, 'Private subject recipient@example.test');
  await assert.rejects(sendFrozen(file, {
    apiKey: "secret-test-key",
    fetchImpl: async () => assert.fail("Malformed payload must not reach Resend"),
  }), error => {
    assert.match(error.message, /frozen envelope/i);
    assert.doesNotMatch(error.message, /Private|recipient/);
    return true;
  });
});

test("hold waits to the absolute target in short sleeps", async () => {
  let clock = Date.parse("2026-10-21T12:53:30Z");
  const delays = [];
  await holdUntil("2026-10-21T12:55:00Z", {
    now: () => clock,
    sleep: async ms => { delays.push(ms); clock += ms; },
  });
  assert.equal(clock, Date.parse("2026-10-21T12:55:00Z"));
  assert.deepEqual(delays, [60000, 30000]);
});

test("hold tolerates late runs and manual runs with no target", async () => {
  const options = {
    now: () => Date.parse("2026-10-21T13:00:00Z"),
    sleep: async () => assert.fail("Late or manual delivery must not wait"),
  };
  await holdUntil("2026-10-21T12:55:00Z", options);
  await holdUntil(undefined, options);
  await holdUntil("", options);
});

test("hold rejects ambiguous timestamps without exposing the value", async () => {
  for (const invalid of ["2026-10-21T05:55:00", "Private customer summary"]) {
    await assert.rejects(holdUntil(invalid), error => {
      assert.match(error.message, /hold target/i);
      assert.doesNotMatch(error.message, /Private|2026/);
      return true;
    });
  }
});
