/**
 * Sheet -> Translate -> Gemini summary -> Email, for one product.
 *
 * Reads the date-named tab that the product's Apps Script
 * (products/<product>/extract.gs) fills with SalesIQ chats, translates
 * column C -> D, writes summary/tag to E/F and sentiment to the product's
 * sentiment column, and emails the digest.
 */

import { createHash } from "node:crypto";
import { google } from "googleapis";
import { generateJson } from "./gemini.js";
import { buildDigestEmail, formatTime } from "./email.js";

const TRANSLATION_ERROR = "Translation Error";
const TRANSLATE_CHUNK_CHARS = 20000;

// Column indexes within A:H (sentiment column varies per product)
const COL = { date: 0, subject: 1, chat: 2, translated: 3, summary: 4, tag: 5 };


/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error("Missing env var " + name);
  return v;
}

function todayIn(tz) {
  // en-CA formats as yyyy-MM-dd
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
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

async function translateRows(rows) {
  const pending = [];
  rows.forEach((r, i) => {
    if (str(r[COL.translated])) return;
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
      const parsed = await generateJson(prompt, TRANSLATE_SCHEMA, { maxOutputTokens: 65536 });
      byCell = new Map((parsed.items || []).map(it => [str(it.cell), String(it.english ?? "")]));
    } catch (e) {
      console.log("Translation error for " + chunk.map(p => p.cell).join(",") + ": " + e.message);
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

async function summarizeRows(rows, baseUrl, supportContact) {
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

  const parsed = await generateJson(prompt, SUMMARY_SCHEMA);
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

export async function run(product) {
  const SHEET_ID = requireEnv(product.sheetIdEnv);
  const RECIPIENTS = requireEnv("MAIL_TO").split(",").map(s => s.trim()).filter(Boolean);
  const sentimentCol = product.sentimentCol;

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: "properties.timeZone,sheets.properties(sheetId,title)"
  });
  const tz = meta.data.properties.timeZone;
  const tab = process.env.TAB_NAME || todayIn(tz);   // the tab name IS the date

  const props = meta.data.sheets.map(s => s.properties).find(p => p.title === tab);
  if (!props) {
    console.log("Tab not found: " + tab + " (no chats saved by Apps Script yet?)");
    return;
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tab}'!A2:H`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER"
  });
  const rows = (res.data.values || []).map(r => Array.from({ length: 8 }, (_, i) => r[i] ?? ""));
  if (!rows.length) {
    console.log("No rows in " + tab + ".");
    return;
  }

  const testTo = process.env.TEST_EMAIL_TO;
  const readOnly = Boolean(process.env.DRY_RUN || testTo);
  const wrote = readOnly ? "(not written: test run) " : "written ";

  const writeCells = data => readOnly ? Promise.resolve() : sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: data.map(d => ({ range: `'${tab}'!${d.range}`, values: d.values }))
    }
  });

  // 1. Translate
  const translations = await translateRows(rows);
  if (translations.length) {
    await writeCells(translations);
    console.log("Translations " + wrote + "to column D: " + translations.length);
  }

  // 2. Summarize
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${props.sheetId}`;
  const items = await summarizeRows(rows, sheetUrl + "&range=", product.supportContact);
  if (!items.length) {
    console.log("No new translated chats to summarize.");
    return;
  }

  await writeCells([
    { range: sentimentCol + "1", values: [["Sentiment"]] },
    ...items.flatMap(it => [
      { range: `E${it.row}:F${it.row}`, values: [[it.summary, it.tag]] },
      { range: sentimentCol + it.row, values: [[it.sentiment]] }
    ])
  ]);
  console.log("Summaries " + wrote + "to E:F + " + sentimentCol + ": " + items.length);

  // 3. Email
  const email = buildDigestEmail(items, tab, sheetUrl, product.name);
  const subject = "Chat Summary " + product.name + " - " + tab;

  if (process.env.DRY_RUN) {
    console.log("DRY_RUN - not sending.\nSubject: " + subject + "\n\n" + email.text);
    return;
  }

  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + requireEnv("RESEND_API_KEY"),
      "Content-Type": "application/json",
      // Same tab + same chats = same key, so a retried run doesn't send the email twice
      "Idempotency-Key": "chat-summary/" + product.sheetIdEnv + "/" + (testTo ? "test/" + Date.now() + "/" : "") + tab + "/" +
        createHash("sha256").update(items.map(it => it.cellRef).join(",")).digest("hex").slice(0, 32)
    },
    body: JSON.stringify({
      from: requireEnv("MAIL_FROM"),
      to: testTo ? [testTo] : RECIPIENTS,
      subject,
      html: email.html,
      text: email.text
    })
  });
  if (!sendRes.ok) {
    throw new Error("Resend HTTP " + sendRes.status + ": " + (await sendRes.text()).slice(0, 2000));
  }

  console.log("Emailed " + items.length + " " + product.name + " summaries for " + tab + " to " + (testTo || "all recipients") + ".");
}
