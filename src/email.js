import {
  GREEN, INK, MUTED, RED,
  badge, button, callout, cell, document, esc, footer, h2, masthead,
  section_close, section_open, small, stat_grid, table,
} from "./shell.js";
import { DigestError } from "./errors.js";

const SENTIMENT_SECTIONS = [
  { key: "negative", title: "Negative", note: "Frustrated, complaints, bugs" },
  { key: "neutral", title: "Neutral", note: "Plain questions & requests" },
  { key: "positive", title: "Positive", note: "Happy, thankful, excited" },
];

export const TAG_STYLE = {
  unanswered: { label: "Unanswered", variant: "critical" },
  forwarded: { label: "Forwarded", variant: "warning" },
  answered: { label: "Answered", variant: "positive" },
  abandoned: { label: "Abandoned", variant: "muted" },
};
const TAG_ORDER = { unanswered: 0, forwarded: 1, answered: 2, abandoned: 3 };
// Word boundaries avoid matching unrelated words such as "recharge".
const ATTENTION_TERMS = /\b(?:refund(?:s|ed|ing)?|cancel(?:s|led|ed|ling|ing|lations?)?|charge(?:s|d|backs?)?|charging|scam(?:s|med|ming)?|legal|data[\s-]+loss|safety)\b/i;

function needsAttention(item) {
  return (item.sentiment === "negative" && ["unanswered", "forwarded"].includes(item.tag)) ||
    ATTENTION_TERMS.test(item.summary);
}

function attentionSummary(summary) {
  const characters = Array.from(String(summary).replace(/\s+/g, " ").trim());
  const limit = 90;
  if (characters.length <= limit) return characters.join("");
  const excerpt = characters.slice(0, limit - 1).join("");
  const boundary = excerpt.lastIndexOf(" ");
  // Keep whole words when possible; bound an overlong token without splitting a surrogate pair.
  const trimmed = characters[limit - 1] === " " || boundary < 0 ? excerpt : excerpt.slice(0, boundary);
  return trimmed.trimEnd() + "…";
}

// Sheet timestamps are wall-clock Dates: UTC fields hold the sheet's local time.
function fmt(date, options) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(date);
}

export function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(date);
}

function plural(count, word) { return `${count} ${word}${count === 1 ? "" : "s"}`; }

export function buildDigestEmail(items, reportDate, sheetUrl, productName, unprocessedCount = 0) {
  const abandoned = items.filter(item => item.tag === "abandoned").sort((a, b) => a.row - b.row);
  const groups = { negative: [], neutral: [], positive: [] };
  for (const item of items) {
    if (item.tag !== "abandoned") (groups[item.sentiment] ?? groups.neutral).push(item);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => (TAG_ORDER[a.tag] - TAG_ORDER[b.tag]) || (a.row - b.row));
  }
  const stats = [
    [groups.negative.length, "Negative", RED],
    [groups.neutral.length, "Neutral", INK],
    [groups.positive.length, "Positive", GREEN],
    [abandoned.length, "Abandoned", MUTED],
  ];
  const attention = items.filter(needsAttention).sort((a, b) => a.row - b.row);
  const attentionLines = attention.slice(0, 5).map(item =>
    `${item.cellRef} · ${attentionSummary(item.summary)}`
  );
  if (attention.length > 5) attentionLines.push(`+${attention.length - 5} more`);

  const date = new Date(`${reportDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== reportDate) {
    throw new DigestError("Invalid report date");
  }
  const longDate = fmt(date, { weekday: "long" }) + ", " + fmt(date, { day: "numeric", month: "long", year: "numeric" });
  const times = items.map(item => item.when).filter(date => date instanceof Date && Number.isFinite(date.getTime())).sort((a, b) => a - b);
  const since = times.length ? "Since " + fmt(times[0], { day: "numeric", month: "short" }) + " " + formatTime(times[0]) : "";
  const count = plural(items.length, "chat");
  const unprocessedNote = unprocessedCount > 0
    ? `${plural(unprocessedCount, "chat")} could not be processed and ${unprocessedCount === 1 ? "is" : "are"} not shown.`
    : "";

  function chatTable(list) {
    const rows = list.map(item => {
      const status = TAG_STYLE[item.tag] ?? TAG_STYLE.unanswered;
      const link = `<a href="${esc(item.link)}" style="color:${INK}; text-decoration:underline; white-space:nowrap;" class="email-link">${esc(item.cellRef)} &#8599;</a>`;
      const time = item.time ? small(item.time) : "";
      return [
        { html: `<div style="white-space:nowrap;">${link}${time}</div>` },
        item.summary,
        { html: `<span style="white-space:nowrap;">${badge(status.label, status.variant)}</span>` },
      ];
    });
    return table(["Chat", "Summary", "Status"], rows, null, true, ["22%", "54%", "24%"]);
  }

  let sections = cell(stat_grid(stats));
  if (attentionLines.length) sections += cell(callout("critical", "Needs your attention", attentionLines));
  for (const section of SENTIMENT_SECTIONS) {
    const list = groups[section.key];
    if (!list.length) continue;
    sections += cell(h2(`${section.title} · ${plural(list.length, "chat")}`), "32px 40px 0 40px") +
      cell(small(section.note)) + cell(chatTable(list));
  }
  if (abandoned.length) {
    sections += cell(small(`Abandoned · ${plural(abandoned.length, "chat")} · No real question or no reply: ${abandoned.map(item => item.cellRef).join(", ")}`), "32px 40px 0 40px");
  }
  if (unprocessedNote) sections += cell(small(unprocessedNote), "16px 40px 0 40px");
  if (!items.length && !unprocessedNote) sections += cell(small("No chats for this report."), "32px 40px 0 40px");
  sections += cell(button("View all in Sheets", sheetUrl), "32px 40px 0 40px");

  const html = document(
    `${productName} chat summary`, `${productName} · ${longDate} · ${count}`,
    masthead("Daily chat digest", `${productName} chat summary`, `${longDate} · ${count}${since ? ` · ${since}` : ""}`) +
      section_open() + sections + section_close(),
    footer(`${productName} chats`, ["Daily chat digest from SalesIQ", "Summaries and sentiment are generated automatically."],
      [["View all in Sheets", sheetUrl]], [`Report for ${longDate}`]),
  );

  // Plain-text fallback preserves full summaries and sheet references.
  let text = productName + " Chat Summary\n" + longDate + " · " + count + "\n" + (since ? since + "\n" : "");
  text += stats.map(([value, label]) => `${label}: ${value}`).join(" · ") + "\n";
  if (attentionLines.length) text += "\nNeeds your attention\n" + attentionLines.join("\n") + "\n";
  for (const section of SENTIMENT_SECTIONS) {
    const list = groups[section.key];
    if (!list.length) continue;
    text += "\n" + section.title.toUpperCase() + " (" + list.length + ")\n";
    for (const item of list) {
      text += "- " + item.cellRef + (item.time ? " " + item.time : "") + " [" + (TAG_STYLE[item.tag] ?? TAG_STYLE.unanswered).label + "] " + item.summary + "\n";
    }
  }
  if (abandoned.length) text += "\nABANDONED: " + abandoned.map(item => item.cellRef).join(", ") + "\n";
  if (unprocessedNote) text += "\n" + unprocessedNote + "\n";
  if (!items.length && !unprocessedNote) text += "\nNo chats for this report.\n";
  text += "\nView all: " + sheetUrl + "\n";
  return { html, text };
}
