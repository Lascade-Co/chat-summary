import { DigestError } from "./errors.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Calls Gemini with a JSON response schema and returns the parsed object. */
export async function generateJson(prompt, responseSchema, { maxOutputTokens = 16384 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new DigestError("Missing GEMINI_API_KEY");

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      topP: 0.1,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema
    }
  };

  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload)
    });
    if (res.ok || !RETRYABLE.has(res.status) || attempt >= 4) break;
    const wait = 5000 * 2 ** (attempt - 1);
    console.log(`Gemini HTTP ${res.status}, retrying in ${wait / 1000}s...`);
    await new Promise(r => setTimeout(r, wait));
  }

  const raw = await res.text();
  if (!res.ok) {
    const status = Number.isInteger(res.status) && res.status >= 100 && res.status <= 599 ? res.status : 0;
    throw new DigestError(`Gemini HTTP ${status}`);
  }

  let outer;
  try { outer = JSON.parse(raw); }
  catch { throw new DigestError("Gemini returned an invalid response"); }
  const candidate = outer?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new DigestError("Gemini returned no text");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new DigestError("Gemini returned invalid model JSON");
  }
}
