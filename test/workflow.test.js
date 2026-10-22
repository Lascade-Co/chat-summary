import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const parsed = spawnSync("python3", ["-c", `
import json, yaml
with open('.github/workflows/chat-summary.yml') as stream:
    workflow = yaml.safe_load(stream)
if True in workflow:
    workflow['on'] = workflow.pop(True)
print(json.dumps(workflow))
`], { cwd: root, encoding: "utf8" });
assert.equal(parsed.status, 0, parsed.stderr);
const workflow = JSON.parse(parsed.stdout);

function evaluate(source, context) {
  const expression = source.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  return Function("ctx", `with (ctx) { return (${expression}); }`)(context);
}
function interpolate(source, context) {
  return source.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expression) => evaluate(expression, context));
}
function context(overrides = {}) {
  return {
    inputs: { dry_run: false, test_email_to: "", product: "all", recovery: false },
    matrix: { product: "travel-animator", edition: "pt", report_date: "2026-11-01" },
    needs: { email: { result: "success" }, gate2: { outputs: { mode: "real" } } },
    github: { event_name: "schedule", event: { schedule: "43 3,6,9 * * *" } },
    steps: { settings: { outputs: { mode: "real", send_step: "Deliver travel-animator PT for 2026-11-01" } },
      dedupe: { outputs: { sent: "false" } } },
    ...overrides,
  };
}

test("scheduled and recovery sends share a product/edition lock after build and hold", () => {
  const job = workflow.jobs.email;
  assert.ok(job, "email job must own the send lock");
  assert.ok(job["timeout-minutes"] >= 75);
  assert.equal(job.concurrency["cancel-in-progress"], false);
  const scheduled = interpolate(job.concurrency.group, context());
  const recovery = interpolate(job.concurrency.group, context({ github: { event_name: "workflow_dispatch", event: {} } }));
  assert.equal(scheduled, recovery, "recovery must wait for the scheduled send's lock");
  assert.notEqual(scheduled, interpolate(job.concurrency.group, context({ matrix: { product: "marine-radar", edition: "pt" } })));
  assert.notEqual(scheduled, interpolate(job.concurrency.group, context({ matrix: { product: "travel-animator", edition: "ist" } })));
  const ids = job.steps.map(step => step.id);
  assert.ok(ids.indexOf("build") < ids.indexOf("hold"));
  assert.ok(ids.indexOf("hold") < ids.indexOf("dedupe"));
  assert.equal(ids.indexOf("dedupe") + 1, ids.indexOf("send"), "the history check must be immediately before sending");
  const deduped = context();
  deduped.steps.dedupe.outputs.sent = "true";
  assert.equal(evaluate(job.steps.find(step => step.id === "send").if, deduped), false);
});

test("a partial matrix, dry run, test send, or selected-product recovery cannot emit Delivered", () => {
  const done = workflow.jobs.done;
  assert.ok(done, "aggregate delivery must be a separate job");
  assert.equal(evaluate(done.if, context()), true);
  for (const result of ["failure", "cancelled", "skipped"]) {
    const ctx = context(); ctx.needs.email.result = result;
    assert.equal(evaluate(done.if, ctx), false, result);
  }
  for (const input of [{ dry_run: true }, { test_email_to: "test@example.invalid" }, { product: "marine-radar" }]) {
    const ctx = context(); Object.assign(ctx.inputs, input);
    assert.equal(evaluate(done.if, ctx), false, JSON.stringify(input));
  }
  const ctx = context(); ctx.needs.gate2.outputs.mode = "test";
  assert.equal(evaluate(done.if, ctx), false);
});

test("preview mode skips Resend and production send is the final successful email step", () => {
  const steps = workflow.jobs.email?.steps;
  assert.ok(steps);
  const sendIndex = steps.findIndex(step => step.id === "send");
  assert.ok(sendIndex > 0);
  const dry = context(); dry.inputs.dry_run = true;
  assert.equal(evaluate(steps[sendIndex].if, dry), false);
  const real = context();
  assert.equal(evaluate(steps[sendIndex].if, real), true);
  for (const step of steps.slice(sendIndex + 1)) {
    assert.ok(step.if, "steps after delivery must be conditional");
    assert.equal(evaluate(step.if, real), false, step.name || step.id);
  }
});

test("encrypted preview artifact contains only the selected rendered HTML and subject", () => {
  const steps = workflow.jobs.email?.steps;
  assert.ok(steps);
  const encrypt = steps.find(step => step.id === "encrypt");
  const upload = steps.find(step => step.uses?.startsWith("actions/upload-artifact@"));
  assert.ok(encrypt && upload, "previews must be encrypted before uploading");
  assert.equal(upload.with.path, "preview.tar.gz.enc");
  assert.equal(interpolate(upload.with.name, context()), "preview-travel-animator-pt");
  const dir = mkdtempSync(path.join(root, ".test-preview-"));
  try {
    mkdirSync(path.join(dir, "out"));
    writeFileSync(path.join(dir, "out/travel-animator-pt.html"), "<html>Preview</html>");
    writeFileSync(path.join(dir, "out/travel-animator-pt.subject.txt"), "Synthetic preview subject");
    writeFileSync(path.join(dir, "out/frozen-travel-animator-pt.json"), '{"private":"must never leave runner"}');
    writeFileSync(path.join(dir, "out/marine-radar-ist.html"), "Other leg");
    const env = { ...process.env, PREVIEW_KEY: "test-only-preview-key", PRODUCT: "travel-animator", EDITION: "pt" };
    const encrypted = spawnSync("bash", ["-e", "-o", "pipefail", "-c", encrypt.run], { cwd: dir, env, encoding: "utf8" });
    assert.equal(encrypted.status, 0, encrypted.stderr);
    assert.equal(encrypted.stdout.includes("Synthetic preview subject"), false);
    const decrypted = spawnSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "env:PREVIEW_KEY", "-in", "preview.tar.gz.enc"], { cwd: dir, env });
    assert.equal(decrypted.status, 0, decrypted.stderr.toString());
    const entries = spawnSync("tar", ["tz"], { input: decrypted.stdout, encoding: "utf8" });
    assert.equal(entries.status, 0, entries.stderr);
    assert.deepEqual(entries.stdout.trim().split("\n").sort(), ["out/travel-animator-pt.html", "out/travel-animator-pt.subject.txt"]);
    assert.ok(readFileSync(path.join(dir, upload.with.path)).length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
