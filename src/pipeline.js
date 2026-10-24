/**
 * Sheet -> Translate -> Gemini summary -> Email, for one product.
 *
 * Reads the date-named tab that the product's Apps Script
 * (products/<product>/extract.gs) fills with SalesIQ chats, translates
 * column C -> D, writes summary/tag to E/F and sentiment to the product's
 * sentiment column, and emails the digest.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { generateJson } from "./gemini.js";
import { buildDigestEmail, formatTime } from "./email.js";
import { subject } from "./subject.js";
import { freezeEnvelope, holdUntil, idempotencyKey, sendFrozen } from "./delivery.js";
import { DigestError } from "./errors.js";

const TRANSLATION_ERROR = "Translation Error";
const TRANSLATE_CHUNK_CHARS = 20000;

// Column indexes within A:H (sentiment column varies per product)
const COL = { date: 0, subject: 1, chat: 2, translated: 3, summary: 4, tag: 5 };


/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function requireEnv(name, env) {
  const v = env[name];
  if (!v) throw new DigestError("Missing env var " + name);
  return v;
}

function todayIn(tz, now) {
  // en-CA formats as yyyy-MM-dd
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(now));
}

/**
 * Sheets serial date -> Date whose UTC fields equal the sheet's wall-clock time.
 * Format these with timeZone "UTC".
 */
function serialToWallClock(serial) {
  if (typeof serial !== "number") return null;
  return new Date(Math.round((serial - 25569) * 86400000));
}

const str = v => String(v ?? "").trim();


/* ------------------------------------------------------------------ */
/* 1. Translate column C -> column D                                   */
/* ------------------------------------------------------------------ */

const TRANSLATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { cell: { type: "STRING" }, english: { type: "STRING" } },
        required: ["cell", "english"]
      }
    }
  },
  required: ["items"]
};

async function translateRows(rows, generate, log) {
  const pending = [];
  rows.forEach((r, i) => {
    if (str(r[COL.summary]) || (str(r[COL.translated]) && str(r[COL.translated]) !== TRANSLATION_ERROR)) return;
    const text = str(r[COL.chat]);
    if (!text) return;
    pending.push({ i, cell: "C" + (i + 2), text: text.slice(0, 5000) });
  });
  if (!pending.length) return [];

  // Batch chats into chunks to keep request/response sizes sane
  const chunks = [[]];
  let size = 0;
  for (const p of pending) {
    if (size + p.text.length > TRANSLATE_CHUNK_CHARS && chunks.at(-1).length) {
      chunks.push([]);
      size = 0;
    }
    chunks.at(-1).push(p);
    size += p.text.length;
  }

  const updates = [];
  for (const chunk of chunks) {
    const prompt = [
      'You will receive customer support chat transcripts, each labelled with a spreadsheet cell like "C2".',
      "Translate each one into English, preserving speaker labels, line breaks and meaning.",
      'If a transcript is ALREADY entirely in English, return "english" as an empty string for it (do not repeat it).',
      'Return STRICT JSON: { "items": [ { "cell": "C2", "english": "..." } ] } with one item per cell.',
      "",
      "TRANSCRIPTS:",
      "",
      ...chunk.map(p => p.cell + ":\n" + p.text + "\n")
    ].join("\n");

    let byCell = new Map();
    try {
      const parsed = await generate(prompt, TRANSLATE_SCHEMA, { maxOutputTokens: 65536 });
      byCell = new Map((parsed.items || []).map(it => [str(it.cell), String(it.english ?? "")]));
    } catch {
      log("Translation failed; rows=" + chunk.length);
    }

    for (const p of chunk) {
      let value;
      if (!byCell.has(p.cell)) value = TRANSLATION_ERROR;
      else value = str(byCell.get(p.cell)) || p.text;   // empty = already English
      rows[p.i][COL.translated] = value;
      updates.push({ range: "D" + (p.i + 2), values: [[value]] });
    }
  }
  return updates;
}


/* ------------------------------------------------------------------ */
/* 2. Summarize + tag via Gemini                                       */
/* ------------------------------------------------------------------ */

const SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          cell:          { type: "STRING" },
          real_question: { type: "BOOLEAN" },
          summary:       { type: "STRING" },
          tag:           { type: "STRING", enum: ["answered", "forwarded", "unanswered", "abandoned"] },
          sentiment:     { type: "STRING", enum: ["positive", "neutral", "negative"] }
        },
        required: ["cell", "real_question", "summary", "tag", "sentiment"],
        // Decide real_question before anything else so the AI's reply can't sway it
        propertyOrdering: ["cell", "real_question", "summary", "tag", "sentiment"]
      }
    }
  },
  required: ["items"]
};

async function summarizeRows(rows, baseUrl, supportContact, generate) {
  let prompt = [
    'You will receive multiple customer chats. Each chat belongs to a spreadsheet cell like "C2", "C3" etc.',
    "",
    "Return STRICT JSON only (no markdown, no extra text) matching this schema:",
    "{",
    '  "items": [',
    '    { "cell": "C2", "real_question": true, "summary": "...", "tag": "answered|forwarded|unanswered|abandoned", "sentiment": "positive|neutral|negative" }',
    "  ]",
    "}",
    "",
    "REAL_QUESTION RULE (look ONLY at what the user wrote, ignore the AI's replies):",
    '- false = greetings like "hi", random words or characters, a lone name or word with no clear request, or anything with no understandable question or request.',
    "- true = the user asked something or requested something understandable (a ship name with a clear ask like \"where is X\" counts).",
    "",
    "SUMMARY RULE:",
    "- One concise sentence capturing what the user asked + what the AI replied (not just the issue).",
    "",
    "TAG RULES (strict, check in this order):",
    '- abandoned = the user never asked a real question (greetings like "hi", random words or characters, a lone name or word with no clear request), ' +
      "OR the AI asked a follow-up clarification and the user did not continue. This applies NO MATTER what the AI replied, even if it pointed to support.",
    "- answered = user asked a real question and the AI gave a clear and correct answer in the chat.",
    '- forwarded = user asked a real question and the AI asked them to email/contact support (e.g. "mail us", "contact ' + (supportContact || "support") + '") instead of answering.',
    "- unanswered = user asked a real question, but the AI did not answer AND did not forward to support.",
    "",
    "SENTIMENT RULES (the USER's mood, not the AI's):",
    "- positive = user is happy, thankful, complimentary, or excited about the app.",
    "- negative = user is frustrated, angry, disappointed, complaining, reporting a bug, or asking for a refund/cancellation.",
    "- neutral = plain question or request with no clear emotion, or too short to tell.",
    "",
    "CHATS:",
    "",
    ""
  ].join("\n");

  const validCells = new Set();
  rows.forEach((r, i) => {
    const text = str(r[COL.translated]);
    if (!text || text === TRANSLATION_ERROR) return;
    if (str(r[COL.summary])) return;
    const cellRef = "C" + (i + 2);
    prompt += cellRef + ": " + text + "\n\n";
    validCells.add(cellRef);
  });

  if (validCells.size === 0) return [];

  const parsed = await generate(prompt, SUMMARY_SCHEMA);
  const allowedTags = new Set(["answered", "forwarded", "unanswered", "abandoned"]);
  const allowedSentiments = new Set(["positive", "neutral", "negative"]);
  const items = [];

  for (const it of parsed.items || []) {
    const cellRef = str(it?.cell);
    if (!/^C\d+$/.test(cellRef) || !validCells.has(cellRef)) continue;
    validCells.delete(cellRef);   // ignore duplicates

    const row = parseInt(cellRef.slice(1), 10);
    let tag = str(it.tag).toLowerCase();
    if (!allowedTags.has(tag)) tag = "unanswered";
    if (it.real_question === false) tag = "abandoned";   // whatever the AI replied
    let sentiment = str(it.sentiment).toLowerCase();
    if (!allowedSentiments.has(sentiment)) sentiment = "neutral";

    const when = serialToWallClock(rows[row - 2][COL.date]);
    items.push({
      cellRef, row, link: baseUrl + cellRef,
      summary: str(it.summary) || "(No summary)",
      tag, sentiment, when,
      time: when ? formatTime(when) : ""
    });
  }
  return items;
}


/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const EDITIONS = { pt: "America/Los_Angeles", ist: "Asia/Kolkata" };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const enabled = value => value === "1" || value === "true";

function editionSettings(env) {
  const edition = env.EDITION || "ist";
  if (!Object.hasOwn(EDITIONS, edition)) throw new DigestError("Invalid EDITION");
  return { edition, timezone: EDITIONS[edition] };
}

function pathsFor(product, edition, outputDir) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) throw new DigestError("Invalid product slug");
  const stem = product.slug + "-" + edition;
  return {
    htmlPath: path.join(outputDir, stem + ".html"),
    subjectPath: path.join(outputDir, stem + ".subject.txt"),
    frozenPath: path.join(outputDir, "frozen-" + stem + ".json")
  };
}

async function waitForTab(sheets, sheetId, tab, deadline, now, pause, log) {
  const end = deadline ? Date.parse(deadline) : null;
  if (deadline && !Number.isFinite(end)) throw new DigestError("Invalid TAB_DEADLINE");
  let attempts = 0;
  for (;;) {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets.properties(sheetId,title)"
    });
    const props = (meta.data.sheets || []).map(s => s.properties).find(p => p.title === tab);
    if (props) return props;
    if (end === null || now() >= end) throw new DigestError("Source tab unavailable at deadline");
    log("Waiting for source tab; attempts=" + ++attempts);
    await pause(Math.min(60000, end - now()));
  }
}

function savedItems(rows, sentimentIndex, baseUrl) {
  return rows.flatMap((row, index) => {
    if (!str(row[COL.summary])) return [];
    const tag = str(row[COL.tag]).toLowerCase();
    const sentiment = str(row[sentimentIndex]).toLowerCase();
    if (!["answered", "forwarded", "unanswered", "abandoned"].includes(tag) ||
        !["negative", "neutral", "positive"].includes(sentiment)) {
      throw new DigestError("Stored summary is missing a valid status or sentiment");
    }
    const cellRef = "C" + (index + 2);
    const when = serialToWallClock(row[COL.date]);
    return [{ cellRef, row: index + 2, link: baseUrl + cellRef,
      summary: str(row[COL.summary]), tag, sentiment, when, time: when ? formatTime(when) : "" }];
  });
}

/** Build once; customer data remains only on this runner's disk. */
export async function build(product, options = {}) {
  const { env = process.env, now = Date.now, sleep: pause = sleep,
    generateJsonImpl = generateJson, outputDir = "out", log = console.log } = options;
  const { edition, timezone } = editionSettings(env);
  const paths = pathsFor(product, edition, outputDir);
  const sheetId = requireEnv(product.sheetIdEnv, env);
  const reportDate = env.REPORT_DATE || todayIn(timezone, now());
  // The extractor names its tab for its IST run day in both editions.
  const tab = env.TAB_NAME || todayIn("Asia/Kolkata", now());
  const dryRun = enabled(env.DRY_RUN);
  const testTo = str(env.TEST_EMAIL_TO);
  if (env.TEST_EMAIL_TO && !testTo) throw new DigestError("Invalid test recipient");
  const readOnly = dryRun || Boolean(testTo);
  // Validate the date before making any changes to the source sheet.
  subject(product.name + " chats", reportDate, timezone, "0 chats");
  const key = !dryRun ? idempotencyKey({ sheetIdEnv: product.sheetIdEnv, edition, reportDate,
    testTo, runId: env.GITHUB_RUN_ID }) : null;
  const from = !dryRun ? requireEnv("MAIL_FROM", env) : null;
  const recipients = !dryRun ? (testTo || requireEnv(edition === "pt" ? "MAIL_TO_PT" : "MAIL_TO", env))
    .split(",").map(value => value.trim()).filter(Boolean) : [];
  if (!dryRun && !recipients.length) throw new DigestError("No recipients configured");
  const sentimentCol = product.sentimentCol;
  if (!["G", "H"].includes(sentimentCol)) throw new DigestError("Invalid sentiment column");
  const sentimentIndex = sentimentCol.charCodeAt(0) - 65;
  const sheets = options.sheets || google.sheets({ version: "v4", auth: new google.auth.GoogleAuth({
    credentials: JSON.parse(requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON", env)),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  }) });
  const props = await waitForTab(sheets, sheetId, tab, env.TAB_DEADLINE, now, pause, log);
  const tabRange = "'" + tab.replace(/'/g, "''") + "'!";
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId, range: tabRange + "A2:H",
    valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER"
  });
  const rows = (res.data.values || []).map(row => Array.from({ length: 8 }, (_, index) => row[index] ?? ""));
  const writeCells = data => readOnly ? Promise.resolve() : sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { valueInputOption: "RAW", data: data.map(value => ({ range: tabRange + value.range, values: value.values })) }
  });

  const translations = await translateRows(rows, generateJsonImpl, log);
  if (translations.length) await writeCells(translations);
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${props.sheetId}`;
  const newItems = await summarizeRows(rows, sheetUrl + "&range=", product.supportContact, generateJsonImpl);
  if (newItems.length) {
    await writeCells([
      { range: sentimentCol + "1", values: [["Sentiment"]] },
      ...newItems.flatMap(item => [
        { range: `E${item.row}:F${item.row}`, values: [[item.summary, item.tag]] },
        { range: sentimentCol + item.row, values: [[item.sentiment]] }
      ])
    ]);
    for (const item of newItems) {
      rows[item.row - 2][COL.summary] = item.summary;
      rows[item.row - 2][COL.tag] = item.tag;
      rows[item.row - 2][sentimentIndex] = item.sentiment;
    }
  }
  // A bad chat must not block the digest; leave its summary empty for a later retry.
  const unprocessedCount = rows.filter(row =>
    (str(row[COL.chat]) || str(row[COL.translated])) && !str(row[COL.summary])).length;
  const items = savedItems(rows, sentimentIndex, sheetUrl + "&range=");
  const email = buildDigestEmail(items, reportDate, sheetUrl, product.name, unprocessedCount);
  const emailSubject = subject(product.name + " chats", reportDate, timezone, items.length + " chats");
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await writeFile(paths.htmlPath, email.html, { mode: 0o600 });
  await writeFile(paths.subjectPath, emailSubject + "\n", { mode: 0o600 });
  if (!dryRun) {
    await freezeEnvelope(paths.frozenPath, { key,
      payload: { from, to: recipients, subject: emailSubject, html: email.html, text: email.text } });
  }
  const subjectHash = createHash("sha256").update(emailSubject).digest("hex").slice(0, 8);
  log(`Built chats=${items.length} summarized=${newItems.length} translated=${translations.length} unprocessed=${unprocessedCount} subject_sha256=${subjectHash}`);
  return { count: items.length, subjectHash, ...paths, frozenPath: dryRun ? null : paths.frozenPath };
}

/** Workflow runs dedupe after this hold, while it still owns the send lock. */
export async function hold(options = {}) {
  const { env = process.env, ...clock } = options;
  await holdUntil(env.HOLD_UNTIL, clock);
}

export async function send(product, options = {}) {
  const { env = process.env, outputDir = "out", log = console.log, ...transport } = options;
  if (enabled(env.DRY_RUN)) throw new DigestError("Sending is disabled in dry-run mode");
  const { edition } = editionSettings(env);
  const { frozenPath } = pathsFor(product, edition, outputDir);
  const result = await sendFrozen(frozenPath, { ...transport, apiKey: requireEnv("RESEND_API_KEY", env) });
  log("Accepted emails=1");
  return result;
}

/** Local convenience; Actions splits these stages to check dedupe after the hold. */
export async function run(product, options = {}) {
  const result = await build(product, options);
  if (!result.frozenPath) return result;
  await hold(options);
  await send(product, options);
  return result;
}
