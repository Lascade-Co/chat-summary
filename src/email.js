import {
  AMBER, CAPTION, FONT_HEADING, GREEN, MUTED, RED,
  badge, button, cell, document, esc, footer, h2, masthead,
  section_close, section_open, small, table,
} from "./shell.js";

const SENTIMENT_SECTIONS = [
  { key: "negative", title: "Negative", note: "Frustrated, complaints, bugs" },
  { key: "neutral", title: "Neutral", note: "Plain questions & requests" },
  { key: "positive", title: "Positive", note: "Happy, thankful, excited" },
];

export const TAG_STYLE = {
  unanswered: { label: "Unanswered", color: RED },
  forwarded: { label: "Forwarded", color: AMBER },
  answered: { label: "Answered", color: GREEN },
  abandoned: { label: "Abandoned", color: MUTED },
};
const TAG_ORDER = { unanswered: 0, forwarded: 1, answered: 2, abandoned: 3 };

// Sheet timestamps are wall-clock Dates: UTC fields hold the sheet's local time.
function fmt(date, options) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(date);
}

export function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(date);
}

function plural(count, word) { return `${count} ${word}${count === 1 ? "" : "s"}`; }

export function buildDigestEmail(items, reportDate, sheetUrl, productName) {
  const abandoned = items.filter(item => item.tag === "abandoned").sort((a, b) => a.row - b.row);
  const groups = { negative: [], neutral: [], positive: [] };
  for (const item of items) {
    if (item.tag !== "abandoned") (groups[item.sentiment] ?? groups.neutral).push(item);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => (TAG_ORDER[a.tag] - TAG_ORDER[b.tag]) || (a.row - b.row));
  }

  const date = new Date(`${reportDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== reportDate) {
    throw new RangeError("Invalid report date");
  }
  const longDate = fmt(date, { weekday: "long" }) + ", " + fmt(date, { day: "numeric", month: "long", year: "numeric" });
  const times = items.map(item => item.when).filter(date => date instanceof Date && Number.isFinite(date.getTime())).sort((a, b) => a - b);
  const since = times.length ? "Since " + fmt(times[0], { day: "numeric", month: "short" }) + " " + formatTime(times[0]) : "";
  const count = plural(items.length, "chat");

  function chatTable(list) {
    const rows = list.map(item => {
      const status = TAG_STYLE[item.tag] ?? TAG_STYLE.unanswered;
      const link = `<a href="${esc(item.link)}" style="font-family:${FONT_HEADING}; font-size:13px; font-weight:600; color:${MUTED}; text-decoration:underline;" class="email-link">${esc(item.cellRef)} &#8599;</a>`;
      const time = item.time ? `<p style="margin:4px 0 0 0; Margin:4px 0 0 0; font-family:${FONT_HEADING}; font-size:12px; line-height:1.4; color:${CAPTION};" class="text-muted">${esc(item.time)}</p>` : "";
      return [{ html: link + time }, item.summary, { html: badge(status.label, "outline", status.color) }];
    });
    return table(["Chat", "Summary", "Status"], rows, null, true, ["18%", "57%", "25%"]);
  }

  let sections = "";
  for (const section of SENTIMENT_SECTIONS) {
    const list = groups[section.key];
    if (!list.length) continue;
    sections += cell(h2(`${section.title} · ${plural(list.length, "chat")}`), "32px 40px 0 40px") +
      cell(small(section.note), "8px 40px 0 40px") + cell(chatTable(list));
  }
  if (abandoned.length) {
    sections += cell(small(`Abandoned · ${plural(abandoned.length, "chat")} · No real question or no reply: ${abandoned.map(item => item.cellRef).join(", ")}`), "32px 40px 0 40px");
  }
  if (!items.length) sections += cell(small("No chats for this report."), "32px 40px 0 40px");
  sections += cell(button("View all in Sheets", sheetUrl), "32px 40px 0 40px");

  const html = document(
    `${productName} chat summary`, `${productName} · ${longDate} · ${count}`,
    masthead("Daily chat digest", `${productName} chat summary`, `${longDate} · ${count}`, since || null) +
      section_open() + sections + section_close(),
    footer(`${productName} chats`, ["Daily chat digest from SalesIQ", "Summaries and sentiment are generated automatically."]),
  );

  // Plain-text fallback preserves full summaries and sheet references.
  let text = productName + " Chat Summary\n" + longDate + " · " + count + "\n" + (since ? since + "\n" : "");
  for (const section of SENTIMENT_SECTIONS) {
    const list = groups[section.key];
    if (!list.length) continue;
    text += "\n" + section.title.toUpperCase() + " (" + list.length + ")\n";
    for (const item of list) {
      text += "- " + item.cellRef + (item.time ? " " + item.time : "") + " [" + (TAG_STYLE[item.tag] ?? TAG_STYLE.unanswered).label + "] " + item.summary + "\n";
    }
  }
  if (abandoned.length) text += "\nABANDONED: " + abandoned.map(item => item.cellRef).join(", ") + "\n";
  if (!items.length) text += "\nNo chats for this report.\n";
  text += "\nView all: " + sheetUrl + "\n";
  return { html, text };
}
