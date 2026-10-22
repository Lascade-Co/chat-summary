import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DigestError, digestFailureMessage } from "../src/errors.js";
import { subject } from "../src/subject.js";
import { buildDigestEmail } from "../src/email.js";
import { table } from "../src/shell.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const entrypoint = fileURLToPath(new URL("../index.js", import.meta.url));
function cli(command, env = {}) {
  return spawnSync(process.execPath, [entrypoint, "marine-radar", command], {
    cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, DRY_RUN: "true", ...env },
  });
}

test("CLI prints a known missing environment name without a stack", () => {
  const result = cli("build");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Missing env var MARINE_RADAR_SHEET_ID\n");
});

test("CLI keeps raw JSON errors and credentials behind the generic line", () => {
  const result = cli("build", {
    MARINE_RADAR_SHEET_ID: "private-sheet-id",
    GOOGLE_SERVICE_ACCOUNT_JSON: '{"private_key":"PRIVATE_CREDENTIAL_AND_ROW_CONTENT',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Chat digest build failed; no delivery marker was recorded.\n");
});

test("CLI identifies an invalid hold target without printing its value", () => {
  const result = cli("hold", { HOLD_UNTIL: "PRIVATE_CUSTOMER_CONTENT" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Invalid hold target; an explicit timezone is required\n");
});

test("only the trusted error class can expose a message, never stacks or response data", () => {
  const safe = new DigestError("Source tab unavailable at deadline");
  safe.stack = "PRIVATE_STACK";
  safe.cause = new Error("PRIVATE_CAUSE");
  safe.response = { body: "PRIVATE_RESPONSE" };
  assert.equal(digestFailureMessage(safe, "build"), "Source tab unavailable at deadline");
  for (const error of [
    new Error("PRIVATE_GOOGLEAPIS_RESPONSE"),
    new TypeError("PRIVATE_FETCH_REQUEST"),
    new SyntaxError("PRIVATE_JSON_CONTENT"),
    Object.assign(new Error("PRIVATE_GEMINI_TRANSPORT"), { name: "DigestError", isSafe: true }),
    { name: "DigestError", message: "PRIVATE_ROW_CONTENT", isSafe: true },
    "PRIVATE_STRING_ERROR", null,
  ]) {
    assert.equal(digestFailureMessage(error, "build"), "Chat digest build failed; no delivery marker was recorded.");
  }
});

test("fixed rendering validation messages stay useful without echoing invalid input", () => {
  for (const [operation, message] of [
    [() => subject("Name", "PRIVATE_INVALID_DATE", "Asia/Kolkata", "0 chats"), "Invalid report date"],
    [() => buildDigestEmail([], "PRIVATE_INVALID_DATE", "https://example.test", "Name"), "Invalid report date"],
    [() => table(["Header"], [["Value"]], ["PRIVATE_INVALID_ALIGNMENT"]), "Invalid table alignment"],
  ]) {
    assert.throws(operation, error => {
      assert.ok(error instanceof DigestError);
      assert.equal(digestFailureMessage(error, "build"), message);
      return true;
    });
  }
});
