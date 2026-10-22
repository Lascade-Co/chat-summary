import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as pipeline from "../src/pipeline.js";
import { DigestError, digestFailureMessage } from "../src/errors.js";

const product = { slug: "travel-animator", name: "Travel Animator", sheetIdEnv: "TRAVEL_ANIMATOR_SHEET_ID", sentimentCol: "G" };
const savedRow = [46315.5, "private subject", "private transcript", "private translation", "Saved customer summary", "answered", "positive"];

async function fixture(t, rows = [savedRow], overrides = {}) {
  const outputDir = await mkdtemp(path.resolve(".pipeline-test-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const writes = [], reads = [], logs = [];
  const env = { TRAVEL_ANIMATOR_SHEET_ID: "sheet-private", EDITION: "pt", REPORT_DATE: "2026-10-21", DRY_RUN: "true", ...overrides };
  const sheets = { spreadsheets: {
    get: async () => ({ data: { properties: { timeZone: "America/Los_Angeles" }, sheets: [{ properties: { title: "2026-10-22", sheetId: 123 } }] } }),
    values: {
      get: async request => { reads.push(request); return { data: { values: rows.map(row => [...row]) } }; },
      batchUpdate: async request => { writes.push(request); }
    }
  } };
  const options = { env, sheets, outputDir, now: () => Date.parse("2026-10-22T01:00:00Z"),
    generateJsonImpl: async () => { throw new Error("must not re-summarize saved rows"); },
    log: message => logs.push(message) };
  return { outputDir, writes, reads, logs, env, sheets, options };
}

test("PT preview reads saved summaries from the current IST tab and uses the report day", async t => {
  const f = await fixture(t);
  const result = await pipeline.build(product, f.options);
  assert.equal(result.count, 1);
  assert.equal(f.reads[0].range, "'2026-10-22'!A2:H");
  assert.match(await readFile(path.join(f.outputDir, "travel-animator-pt.html"), "utf8"), /Saved customer summary/);
  const subject = await readFile(path.join(f.outputDir, "travel-animator-pt.subject.txt"), "utf8");
  assert.equal(subject.trim(), "Travel Animator chats · Wed, Oct 21 — 1 chats");
  assert.equal(f.writes.length, 0);
  assert.deepEqual((await readdir(f.outputDir)).sort(), ["travel-animator-pt.html", "travel-animator-pt.subject.txt"]);
  for (const secret of ["Saved customer summary", "private transcript", "private subject", subject.trim()]) {
    assert.ok(!f.logs.join("\n").includes(secret));
  }
  assert.match(f.logs.join("\n"), /subject_sha256=[a-f0-9]{8}/);
});

test("production combines saved and new summaries, writes only new cells, and freezes the PT recipients", async t => {
  const f = await fixture(t, [savedRow, [46315.6, "", "new chat", "new chat"]], {
    DRY_RUN: "false", MAIL_FROM: "Chat Digest <digest@example.test>", MAIL_TO: "ist@example.test", MAIL_TO_PT: "pt@example.test"
  });
  let modelCalls = 0;
  f.options.generateJsonImpl = async prompt => {
    modelCalls++;
    assert.ok(!prompt.includes("Saved customer summary"));
    return { items: [{ cell: "C3", real_question: true, summary: "Fresh summary", tag: "forwarded", sentiment: "negative" }] };
  };
  const result = await pipeline.build(product, f.options);
  assert.equal(result.count, 2);
  assert.equal(modelCalls, 1);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].requestBody.data.map(value => value.range), ["'2026-10-22'!G1", "'2026-10-22'!E3:F3", "'2026-10-22'!G3"]);
  const frozen = JSON.parse(await readFile(result.frozenPath, "utf8"));
  assert.equal(frozen.key, "chat-summary/TRAVEL_ANIMATOR_SHEET_ID/2026-10-22/pt");
  const payload = JSON.parse(frozen.body);
  assert.deepEqual(payload.to, ["pt@example.test"]);
  assert.match(payload.html, /Saved customer summary/);
  assert.match(payload.html, /Fresh summary/);
  assert.ok(!("scheduled_at" in payload));
  assert.ok(!f.logs.join("\n").includes("pt@example.test"));
});

test("failed translation and skipped summaries do not block the digest and are retried next run", async t => {
  const rows = [savedRow,
    [46315.6, "", "private translation failure", "Translation Error"],
    [46315.7, "", "private skipped chat", "private skipped translation"]];
  for (let run = 0; run < 2; run++) {
    const f = await fixture(t, rows, { DRY_RUN: "false", MAIL_FROM: "digest@example.test", MAIL_TO_PT: "pt@example.test" });
    let translationAttempts = 0, summaryAttempts = 0;
    f.options.generateJsonImpl = async prompt => {
      if (prompt.includes("TRANSCRIPTS:")) {
        translationAttempts++;
        assert.match(prompt, /C3:\nprivate translation failure/);
        throw new Error("private upstream error");
      }
      summaryAttempts++;
      assert.match(prompt, /C4: private skipped translation/);
      return { items: [] };
    };
    const result = await pipeline.build(product, f.options);
    assert.equal(result.count, 1);
    assert.equal(translationAttempts, 1);
    assert.equal(summaryAttempts, 1);
    const frozen = JSON.parse(await readFile(result.frozenPath, "utf8"));
    const payload = JSON.parse(frozen.body);
    assert.match(payload.html, /Saved customer summary/);
    for (const body of [payload.html, payload.text]) {
      assert.match(body, /2 chats could not be processed and are not shown\./);
      assert.doesNotMatch(body, /private translation failure|private skipped chat|private skipped translation/);
    }
    assert.deepEqual(f.writes[0].requestBody.data, [{ range: "'2026-10-22'!D3", values: [["Translation Error"]] }]);
    assert.match(f.logs.join("\n"), /unprocessed=2/);
    assert.doesNotMatch(f.logs.join("\n"), /Saved customer summary|private|pt@example/);
  }
});

test("test send is read only and freezes a key isolated from production", async t => {
  const f = await fixture(t, [savedRow], { DRY_RUN: "0", TEST_EMAIL_TO: "tester@example.test", GITHUB_RUN_ID: "5678", MAIL_FROM: "digest@example.test" });
  const result = await pipeline.build(product, f.options);
  const frozen = JSON.parse(await readFile(result.frozenPath, "utf8"));
  assert.equal(frozen.key, "chat-summary/test/TRAVEL_ANIMATOR_SHEET_ID/2026-10-22/pt/5678");
  assert.deepEqual(JSON.parse(frozen.body).to, ["tester@example.test"]);
  assert.equal(f.writes.length, 0);
});

test("empty tabs still render a zero-chat digest", async t => {
  const f = await fixture(t, []);
  const result = await pipeline.build(product, f.options);
  assert.equal(result.count, 0);
  assert.match(await readFile(result.htmlPath, "utf8"), /0 chats/);
});

test("missing tab polls once per minute until it appears", async t => {
  const f = await fixture(t, [savedRow], { TAB_NAME: "2026-10-21", TAB_DEADLINE: "2026-10-21T12:40:00Z" });
  let now = Date.parse("2026-10-21T12:05:00Z"), attempts = 0;
  const sleeps = [];
  f.options.now = () => now;
  f.options.sleep = async ms => { sleeps.push(ms); now += ms; };
  f.sheets.spreadsheets.get = async () => ({ data: { sheets: ++attempts === 3 ? [{ properties: { title: "2026-10-21", sheetId: 123 } }] : [] } });
  await pipeline.build(product, f.options);
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [60000, 60000]);
});

test("missing tab fails at the deadline and manual missing tabs fail immediately", async t => {
  for (const deadline of ["2026-10-21T12:06:30Z", ""]) {
    const f = await fixture(t, [], { TAB_DEADLINE: deadline });
    let now = Date.parse("2026-10-21T12:05:00Z");
    const sleeps = [];
    f.options.now = () => now;
    f.options.sleep = async ms => { sleeps.push(ms); now += ms; };
    f.sheets.spreadsheets.get = async () => ({ data: { sheets: [] } });
    await assert.rejects(pipeline.build(product, f.options), error => {
      assert.equal(error.name, "DigestError");
      assert.equal(error.message, "Source tab unavailable at deadline");
      assert.ok(error instanceof DigestError);
      assert.equal(digestFailureMessage(error, "build"), "Source tab unavailable at deadline");
      return true;
    });
    assert.deepEqual(sleeps, deadline ? [60000, 30000] : []);
    assert.deepEqual(await readdir(f.outputDir), []);
  }
});

test("MarineRadar reads sentiment from H and does not interpret the G message ID as sentiment", async t => {
  const f = await fixture(t, [[...savedRow.slice(0, 6), "message-123", "negative"]]);
  const result = await pipeline.build({ ...product, sentimentCol: "H" }, f.options);
  assert.match(await readFile(result.htmlPath, "utf8"), /Negative/);
  assert.equal(result.count, 1);
});

test("a whitespace-only test override fails before production recipients or sheet data are used", async t => {
  const f = await fixture(t, [savedRow], { DRY_RUN: "false", TEST_EMAIL_TO: "  ",
    MAIL_FROM: "digest@example.test", MAIL_TO_PT: "production@example.test" });
  await assert.rejects(pipeline.build(product, f.options), /test recipient/i);
  assert.equal(f.reads.length, 0);
  assert.deepEqual(await readdir(f.outputDir), []);
});
