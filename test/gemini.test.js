import assert from "node:assert/strict";
import test from "node:test";
import { generateJson } from "../src/gemini.js";

test("Gemini errors never expose response or customer content", async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "fixture-key";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
  const privateText = "PRIVATE_CUSTOMER_SUMMARY_AND_RECIPIENT";
  for (const response of [
    new Response(privateText, { status: 400 }),
    new Response(privateText, { status: 200 }),
    new Response(JSON.stringify({ candidates: [{ finishReason: privateText }] }), { status: 200 }),
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: privateText }] } }] }), { status: 200 })
  ]) {
    globalThis.fetch = async () => response;
    await assert.rejects(generateJson("fixture", {}), error => {
      assert.ok(!error.message.includes(privateText));
      return true;
    });
  }
});
