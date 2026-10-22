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
  assert.ok(html.indexOf("Open issue") < html.indexOf("Answered issue"));
  assert.ok(html.indexOf("Answered issue") < html.indexOf("General question"));
  assert.ok(html.indexOf("General question") < html.indexOf("Thank you"));
  assert.match(html, /<span[^>]*color:#c0392b[^>]*>Unanswered<\/span>/);
  assert.match(html, /<span[^>]*color:#c9922a[^>]*>Forwarded<\/span>/);
  assert.match(html, /<span[^>]*color:#2a8c4a[^>]*>Answered<\/span>/);
  assert.match(html, /<p[^>]*class="text-muted"[^>]*>[^<]*Abandoned[^<]*E6/);
  assert.doesNotMatch(html, /Do not render an abandoned summary/);
  assert.match(text, /NEGATIVE \(2\)/);
  assert.match(text, /\[Unanswered\] Open issue/);
  assert.match(text, /ABANDONED: E6/);
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
