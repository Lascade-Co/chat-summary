/** Frozen, runner-local Resend delivery. Never log payloads or upstream errors. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleepFor } from "node:timers/promises";

const SEND_URL = "https://api.resend.com/emails";

function validKey(value) {
  return typeof value === "string" && value.length > 0 && !/[\r\n\x00]/.test(value);
}

/** Test sends are stable within one run and cannot consume a production key. */
export function idempotencyKey({ sheetIdEnv, tab, edition, testTo, runId }) {
  if (!validKey(sheetIdEnv) || !validKey(tab) || !["pt", "ist"].includes(edition)) {
    throw new Error("Invalid idempotency key settings");
  }
  const suffix = `${sheetIdEnv}/${tab}/${edition}`;
  if (!testTo) return `chat-summary/${suffix}`;
  const testRunId = runId === undefined ? String(Date.now()) : runId;
  if (!validKey(testRunId)) throw new Error("Test delivery requires a run id");
  return `chat-summary/test/${suffix}/${testRunId}`;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid email payload");
  }
  if (Object.hasOwn(payload, "scheduled_at")) {
    throw new Error("Scheduled delivery is not supported");
  }
}

/** Create once with private permissions. An existing envelope is never replaced. */
export async function freezeEnvelope(file, { key, payload }) {
  if (!validKey(key)) throw new Error("Invalid idempotency key settings");
  validatePayload(payload);
  let body;
  try {
    body = JSON.stringify(payload);
    validatePayload(JSON.parse(body));
  } catch {
    throw new Error("Invalid email payload");
  }
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify({ key, body }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Frozen envelope already exists");
    throw new Error("Unable to write frozen envelope");
  }
  return file;
}

async function readEnvelope(file) {
  try {
    const envelope = JSON.parse(await readFile(file, "utf8"));
    if (!validKey(envelope.key) || typeof envelope.body !== "string") throw new Error();
    validatePayload(JSON.parse(envelope.body));
    return envelope;
  } catch {
    // JSON and filesystem errors can contain customer data or local paths.
    throw new Error("Invalid frozen envelope");
  }
}

/**
 * Read once, then submit the same payload bytes and key at most maxAttempts times.
 * A 200 is acceptance; changed payload conflicts fail closed for investigation.
 */
export async function sendFrozen(file, {
  apiKey,
  fetchImpl = globalThis.fetch,
  sleep = sleepFor,
  maxAttempts = 4,
} = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Resend API key is missing");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("Invalid delivery attempt limit");
  }
  const { key, body } = await readEnvelope(file);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Idempotency-Key": key,
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    let status = 0;
    try {
      response = await fetchImpl(SEND_URL, {
        method: "POST", headers: { ...headers }, body,
        signal: AbortSignal.timeout(60_000),
      });
      status = response.status;
    } catch {
      // The POST may have been accepted before a connection failure. Retry only
      // with this invocation's original frozen bytes and idempotency key.
    }
    if (status === 200) return { accepted: true, status: 200, attempts: attempt };

    let category = status === 0 ? "transport" : "HTTP error";
    let retryable = status === 0 || status === 429 || (status >= 500 && status <= 599);
    if (status === 409) {
      let name;
      try { name = (await response.json()).name; } catch { /* Unknown conflicts fail closed. */ }
      if (name === "concurrent_idempotent_requests") {
        category = "concurrent_idempotent_requests";
        retryable = true;
      } else {
        category = name === "invalid_idempotent_request" ? "invalid_idempotent_request" : "idempotency conflict";
        retryable = false;
      }
    }
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Resend delivery failed: HTTP ${status} (${category})`);
    }
    await sleep(Math.min(1000 * 2 ** (attempt - 1), 15_000));
  }
}

/** Manual runs omit the target. Late runs send immediately with the report date. */
export async function holdUntil(iso, { now = Date.now, sleep = sleepFor } = {}) {
  if (!iso) return;
  const target = Date.parse(iso);
  if (typeof iso !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(iso) || !Number.isFinite(target)) {
    throw new Error("Invalid hold target; an explicit timezone is required");
  }
  let remaining;
  while ((remaining = target - now()) > 0) {
    await sleep(Math.min(remaining, 60_000));
  }
}
