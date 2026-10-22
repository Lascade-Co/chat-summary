import assert from "node:assert/strict";
import test from "node:test";
import { buildDigestEmail, formatTime } from "../src/email.js";
import * as shell from "../src/shell.js";

const chat = (overrides = {}) => ({
  row: 2,
  cellRef: "E2",
  link: "https://docs.google.com/spreadsheets/d/example/edit#range=E2",
  when: new Date("2025-10-21T04:30:00Z"),
  time: "4:30 AM",
  summary: "Export is stuck.",
  sentiment: "negative",
  tag: "unanswered",
  ...overrides,
});

test("digest uses the email shell with responsive and dark-mode hooks", () => {
  const { html } = buildDigestEmail([chat()], "2025-10-21", "https://docs.google.com/", "Travel Animator");
  assert.match(html, /^<!DOCTYPE html PUBLIC/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /\[data-ogsc\]/);
  assert.match(html, /<h1[^>]*>Travel Animator chat summary<\/h1>/);
  assert.match(html, /Tuesday, 21 October 2025 · 1 chat/);
  assert.match(html, /View all in Sheets/);
  assert.match(html, /class="footer-bg body-cell"/);
});

test("digest groups sentiment and orders unanswered chats before answered chats", () => {
  const items = [
    chat({ row: 2, cellRef: "E2", summary: "Answered issue", tag: "answered" }),
    chat({ row: 4, cellRef: "E4", summary: "Open issue" }),
    chat({ row: 3, cellRef: "E3", summary: "General question", sentiment: "neutral", tag: "forwarded" }),
    chat({ row: 5, cellRef: "E5", summary: "Thank you", sentiment: "positive", tag: "answered" }),
    chat({ row: 6, cellRef: "E6", summary: "Do not render an abandoned summary", tag: "abandoned" }),
  ];
  const { html, text } = buildDigestEmail(items, "2025-10-21", "https://docs.google.com/", "MarineRadar");
  const detail = html.slice(html.indexOf(">Negative · 2 chats</h2>"));
  assert.ok(detail.indexOf("Open issue") < detail.indexOf("Answered issue"));
  assert.ok(detail.indexOf("Answered issue") < detail.indexOf("General question"));
  assert.ok(detail.indexOf("General question") < detail.indexOf("Thank you"));
  for (const label of ["Unanswered", "Forwarded", "Answered"]) {
    assert.ok(detail.includes(shell.badge(label, "outline")));
  }
  assert.match(html, /<p[^>]*class="text-muted"[^>]*>[^<]*Abandoned[^<]*E6/);
  assert.doesNotMatch(html, /Do not render an abandoned summary/);
  assert.match(text, /NEGATIVE \(2\)/);
  assert.match(text, /\[Unanswered\] Open issue/);
  assert.match(text, /ABANDONED: E6/);
});

const attentionFragment = html => html.match(/<td[^>]*class="callout-critical-dm">([\s\S]*?)<\/td>/)?.[1] ?? "";

test("four stat cards follow the header rule and count abandoned chats separately", () => {
  const items = [
    chat({ row: 2 }), chat({ row: 3 }),
    chat({ row: 4, sentiment: "neutral" }),
    chat({ row: 5, sentiment: "positive" }),
    chat({ row: 6, sentiment: "positive" }),
    chat({ row: 7, sentiment: "positive" }),
    chat({ row: 8, sentiment: "negative", tag: "abandoned" }),
  ];
  const { html, text } = buildDigestEmail(items, "2025-10-21", "https://docs.google.com/", "MarineRadar");
  const cards = [...html.matchAll(/<p[^>]*color:(#[a-f0-9]+);" class="stat-value heading-dm">(\d+)<\/p><p[^>]*class="stat-label-dm">([^<]+)<\/p>/g)]
    .map(([, color, count, label]) => ({ label, count: Number(count), color }));
  assert.deepEqual(cards, [
    { label: "Negative", count: 2, color: "#c0392b" },
    { label: "Neutral", count: 1, color: "#222222" },
    { label: "Positive", count: 3, color: "#2a8c4a" },
    { label: "Abandoned", count: 1, color: "#555555" },
  ]);
  assert.match(html, /class="header-border">&nbsp;<\/td><\/tr><\/table><\/td><\/tr><\/table><table[^>]*><tr><td style="padding:16px 40px 0 40px; font-size:0; text-align:center;" class="body-cell">/);
  assert.match(text, /Negative: 2 · Neutral: 1 · Positive: 3 · Abandoned: 1/);
});

test("attention flags negative unanswered or forwarded chats and ignores other status/sentiment pairs", () => {
  const flagged = [
    chat({ row: 12, cellRef: "C12", summary: "Export is stuck.\n  Please help." }),
    chat({ row: 13, cellRef: "C13", summary: "Support escalation", tag: "forwarded" }),
  ];
  const other = [
    chat({ row: 14, cellRef: "C14", summary: "Fixed export", tag: "answered" }),
    chat({ row: 15, cellRef: "C15", summary: "Plain question", sentiment: "neutral" }),
    chat({ row: 16, cellRef: "C16", summary: "Thank you", sentiment: "positive", tag: "forwarded" }),
    chat({ row: 17, cellRef: "C17", summary: "No reply", tag: "abandoned" }),
  ];
  const { html, text } = buildDigestEmail([...other, ...flagged], "2025-10-21", "https://docs.google.com/", "MarineRadar");
  const attention = attentionFragment(html);
  assert.match(attention, /Needs your attention/);
  assert.match(attention, /C12 · Export is stuck\. Please help\.<br \/>C13 · Support escalation/);
  assert.doesNotMatch(attention, /Fixed export|Plain question|Thank you|No reply/);
  assert.match(text, /Needs your attention\nC12 · Export is stuck\. Please help\.\nC13 · Support escalation\n/);
  assert.ok(html.indexOf('>Abandoned</p>') < html.indexOf('>Needs your attention</p>'));
  assert.ok(html.indexOf('>Needs your attention</p>') < html.indexOf('>Negative · 3 chats</h2>'));
});

test("attention keywords flag every sentiment and status, including common word forms", () => {
  const summaries = ["Refund requested", "Subscription cancellation", "Unexpected charge", "SCAM report", "Legal concern", "Data\nloss", "Safety issue", "Two refunds", "Account cancelled", "Charged twice", "Chargeback pending"];
  for (const summary of summaries) {
    const { html, text } = buildDigestEmail([chat({ cellRef: "C12", summary, sentiment: "positive", tag: "answered" })], "2025-10-21", "https://docs.google.com/", "MarineRadar");
    const line = `C12 · ${summary.replace(/\s+/g, " ")}`;
    assert.ok(attentionFragment(html).includes(line), summary);
    assert.ok(text.includes(`Needs your attention\n${line}\n`), summary);
  }
  const { html } = buildDigestEmail([chat({ summary: "Data-loss report", tag: "abandoned" })], "2025-10-21", "https://docs.google.com/", "MarineRadar");
  assert.match(attentionFragment(html), /Data-loss report/);
});

test("attention lists at most five chats in sheet order and counts the rest once", () => {
  const items = Array.from({ length: 7 }, (_, index) => chat({ row: index + 12, cellRef: `C${index + 12}`, summary: `Refund request ${index + 1}` })).reverse();
  const { html, text } = buildDigestEmail(items, "2025-10-21", "https://docs.google.com/", "MarineRadar");
  const attention = attentionFragment(html);
  const lines = items.toReversed().slice(0, 5).map(item => `${item.cellRef} · ${item.summary}`);
  assert.ok(attention.includes(lines.join("<br />") + "<br />+2 more"));
  assert.doesNotMatch(attention, /C17|C18/);
  assert.ok(text.includes("Needs your attention\n" + lines.join("\n") + "\n+2 more\n"));
  assert.equal(text.match(/\+2 more/g)?.length, 1);
});

test("attention is omitted without matches, including similar words and a zero-chat day", () => {
  for (const items of [[], [chat({ summary: "Recharged battery; legally purchased app", sentiment: "neutral", tag: "answered" })]]) {
    const { html, text } = buildDigestEmail(items, "2025-10-21", "https://docs.google.com/", "MarineRadar");
    assert.equal(attentionFragment(html), "");
    assert.doesNotMatch(html + text, /Needs your attention|All clear/i);
  }
  const { html, text } = buildDigestEmail([], "2025-10-21", "https://docs.google.com/", "MarineRadar");
  assert.equal((html.match(/class="stat-value heading-dm">0<\/p>/g) ?? []).length, 4);
  assert.match(text, /Negative: 0 · Neutral: 0 · Positive: 0 · Abandoned: 0/);
});

test("digest uses canonical content spacing, captions, links, and complete footer typography", () => {
  const { html } = buildDigestEmail([chat()], "2025-10-21", "https://docs.google.com/", "MarineRadar");
  assert.match(html, /<td style="padding:32px 40px 0 40px;" class="body-cell"><h2[^>]*>Negative · 1 chat<\/h2>/);
  assert.match(html, /<td style="padding:16px 40px 0 40px;" class="body-cell"><p[^>]*>Frustrated, complaints, bugs<\/p>/);
  assert.ok(html.includes(shell.small("4:30 AM")));
  assert.match(html, /<a href="https:\/\/docs.google.com\/spreadsheets\/d\/example\/edit#range=E2" style="color:#222222; text-decoration:underline;" class="email-link">E2 &#8599;<\/a>/);
  assert.doesNotMatch(html, /padding:8px 40px 0 40px|width="18%"|class="text-main tfix"/);
  assert.ok(html.includes('font-size:12px; line-height:1.5; color:#555555; text-align:center;'));
  assert.match(html, /<p[^>]*font-size:11px; line-height:1.4; color:#888888; text-align:center;" class="text-muted">Report for Tuesday, 21 October 2025<\/p>/);
});

test("digest escapes user text and link attributes", () => {
  const item = chat({
    summary: '<script>alert("summary")</script> & details',
    cellRef: 'E2" onclick="bad',
    time: '<img src=x onerror="bad">',
    link: 'https://example.test/?q="bad"&a=1',
  });
  const { html, text } = buildDigestEmail([item], "2025-10-21", 'https://example.test/?q="sheet"&a=2', 'A < B & "C"');
  assert.doesNotMatch(html, /<script>|<img src=x|onclick="bad/);
  assert.match(html, /&lt;script&gt;alert\(&quot;summary&quot;\)&lt;\/script&gt; &amp; details/);
  assert.match(html, /href="https:\/\/example.test\/\?q=&quot;bad&quot;&amp;a=1"/);
  assert.match(html, /href="https:\/\/example.test\/\?q=&quot;sheet&quot;&amp;a=2"/);
  assert.match(html, /A &lt; B &amp; &quot;C&quot;/);
  assert.match(text, /<script>alert\("summary"\)<\/script> & details/);
});

test("zero chats still produces a complete digest", () => {
  const { html, text } = buildDigestEmail([], "2025-11-01", "https://docs.google.com/", "Travel Animator");
  assert.match(html, /Saturday, 1 November 2025 · 0 chats/);
  assert.match(html, /No chats for this report/);
  assert.match(html, /<\/html>\s*$/);
  assert.match(text, /0 chats/);
  assert.doesNotMatch(html + text, /could not be processed/);
});

test("unprocessed chat counts appear once in each body beside the abandoned section", () => {
  const note = "3 chats could not be processed and are not shown.";
  const { html, text } = buildDigestEmail([chat({ tag: "abandoned" })], "2025-11-01", "https://docs.google.com/", "Travel Animator", 3);
  assert.equal(html.split(note).length - 1, 1);
  assert.equal(text.split(note).length - 1, 1);
  assert.match(html, /<p[^>]*class="text-muted"[^>]*>3 chats could not be processed and are not shown\.<\/p>/);
  assert.ok(html.indexOf("Abandoned ·") < html.indexOf(note));
  assert.ok(html.indexOf(note) < html.indexOf("View all in Sheets"));
});

test("a digest with only an unprocessed chat explains the omission without claiming the tab is empty", () => {
  const { html, text } = buildDigestEmail([], "2025-11-01", "https://docs.google.com/", "Travel Animator", 1);
  for (const body of [html, text]) {
    assert.match(body, /1 chat could not be processed and is not shown\./);
    assert.doesNotMatch(body, /No chats for this report/);
  }
});

test("sheet wall-clock times are not converted into the process timezone", () => {
  assert.equal(formatTime(new Date("2025-10-21T04:30:00Z")), "4:30 AM");
});

test("shell escapes text while preserving explicitly composed table cells", () => {
  const html = shell.table(["<Header>"], [["<User text>"], [{ html: shell.badge("<Open>") }]]);
  assert.match(html, /&lt;Header&gt;/);
  assert.match(html, /&lt;User text&gt;/);
  assert.match(html, /<span[^>]*>&lt;Open&gt;<\/span>/);
  assert.doesNotMatch(html, /<Header>|<User text>|<Open>/);
});

test("shell text helpers and footer escape their data", () => {
  const html = [
    shell.masthead("<eyebrow>", "<title>", "<lead>", "<caption>"),
    shell.h2("<h2>"), shell.h3("<h3>"), shell.p("<body>"),
    shell.lead("<intro>"), shell.small("<small>"),
    shell.callout("critical", "<alert>", "<message>"),
    shell.footer("<footer>", ["<line>"], [["<link>", 'https://example.test/?q="footer"']]),
  ].join("");
  for (const text of ["eyebrow", "title", "lead", "caption", "h2", "h3", "body", "intro", "small", "alert", "message", "footer", "line", "link"]) {
    assert.ok(html.includes(`&lt;${text}&gt;`), `escaped ${text}`);
  }
  assert.match(html, /href="https:\/\/example.test\/\?q=&quot;footer&quot;"/);
});

test("stat grid wraps after four cards and escapes values", () => {
  const html = shell.stat_grid([["<1>", "<label>", "#c0392b"], [2, "Two"], [3, "Three"], [4, "Four"], [5, "Five"]]);
  assert.equal((html.match(/class="stat-col"/g) || []).length, 5);
  assert.equal((html.match(/<table[^>]*width="520" align="center"/g) || []).length, 2);
  assert.match(html, /&lt;1&gt;/);
  assert.match(html, /&lt;label&gt;/);
});
