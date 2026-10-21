/* Digest email layout (ported from the Apps Script version). */

const SENTIMENT_SECTIONS = [
  { key: "negative", title: "Negative", note: "Frustrated, complaints, bugs" },
  { key: "neutral",  title: "Neutral",  note: "Plain questions & requests" },
  { key: "positive", title: "Positive", note: "Happy, thankful, excited" }
];

export const TAG_STYLE = {
  unanswered: { label: "Unanswered", color: "#b3261e" },
  forwarded:  { label: "Forwarded",  color: "#b8860b" },
  answered:   { label: "Answered",   color: "#2e7d32" },
  abandoned:  { label: "Abandoned",  color: "#8a8a8a" }
};
const TAG_ORDER = { unanswered: 0, forwarded: 1, answered: 2, abandoned: 3 };

/*
 * Dates here are "wall-clock" Dates: their UTC fields hold the sheet's local
 * time (see serialToWallClock in index.js), so always format with timeZone UTC.
 */
function fmt(d, opts) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(d);
}
export function formatTime(d) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(d);
}

function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDigestEmail(items, tabName, sheetUrl, productName) {
  const C = {
    bg: "#f3f2f0", card: "#ffffff", zebra: "#faf8f5", ink: "#1f1f1f",
    body: "#2b2b2b", muted: "#6b6b6b", faint: "#8a8a8a", line: "#e6e4e0"
  };
  const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

  // Group: abandoned on its own, the rest by sentiment
  const abandoned = items.filter(it => it.tag === "abandoned").sort((a, b) => a.row - b.row);
  const groups = { negative: [], neutral: [], positive: [] };
  items.forEach(it => { if (it.tag !== "abandoned") groups[it.sentiment].push(it); });
  Object.values(groups).forEach(list =>
    list.sort((a, b) => (TAG_ORDER[a.tag] - TAG_ORDER[b.tag]) || (a.row - b.row)));

  // Header dates
  const [y, m, d] = tabName.split("-").map(Number);
  const dateObj  = new Date(Date.UTC(y, m - 1, d, 12));
  const longDate = fmt(dateObj, { weekday: "long" }) + ", " +
                   fmt(dateObj, { day: "numeric", month: "long", year: "numeric" });

  const times = items.map(it => it.when).filter(Boolean).sort((a, b) => a - b);
  const since = times.length
    ? "Since " + fmt(times[0], { day: "numeric", month: "short" }) + " " + formatTime(times[0])
    : "";

  // Table pieces
  function th(label, width) {
    return '<th align="left" valign="bottom" width="' + width + '" style="padding:14px 14px 12px;font:700 11px/1.35 ' + FONT +
           ';letter-spacing:0.6px;text-transform:uppercase;color:' + C.faint + ';border-bottom:1px solid ' + C.line + ';">' + label + '</th>';
  }
  function td(html, extra) {
    return '<td valign="middle" style="padding:13px 14px;font:400 14px/1.45 ' + FONT + ';color:' + C.body + ';' + (extra || "") + '">' + html + '</td>';
  }

  function chatTable(list) {
    let rows = "";
    list.forEach((it, i) => {
      const t = TAG_STYLE[it.tag];
      const chatCell =
        '<a href="' + it.link + '" style="color:' + C.muted + ';font-weight:700;font-size:13px;text-decoration:none;">' + it.cellRef + ' &#8599;</a>' +
        (it.time ? '<div style="font:400 12px/1.4 ' + FONT + ';color:' + C.faint + ';padding-top:2px;">' + esc(it.time) + '</div>' : "");
      rows += '<tr style="background:' + (i % 2 ? C.zebra : C.card) + ';">' +
        td(chatCell, "white-space:nowrap;") +
        td(esc(it.summary)) +
        td(t.label, "color:" + t.color + ";font-weight:600;white-space:nowrap;") +
      '</tr>';
    });
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.card +
      '" style="background:' + C.card + ';border-radius:6px;border-collapse:separate;overflow:hidden;">' +
      '<tr>' + th("Chat", "16%") + th("Summary", "62%") + th("Status", "22%") + '</tr>' +
      rows + '</table>';
  }

  function sectionHead(title, note, count, unit) {
    return '<tr><td style="padding:30px 0 10px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td valign="bottom" style="font:700 19px/1.3 ' + FONT + ';color:' + C.ink + ';">' + title +
          '<span style="font:400 14px ' + FONT + ';color:' + C.muted + ';padding-left:8px;">' + note + '</span></td>' +
        '<td align="right" valign="bottom" style="font:600 12px/1.3 ' + FONT + ';color:' + C.muted + ';white-space:nowrap;">' + plural(count, unit) + '</td>' +
      '</tr></table></td></tr>';
  }

  let sections = "";
  SENTIMENT_SECTIONS.forEach(s => {
    const list = groups[s.key];
    if (!list.length) return;
    sections += sectionHead(s.title, s.note, list.length, "chat") +
                '<tr><td>' + chatTable(list) + '</td></tr>';
  });

  if (abandoned.length) {
    const links = abandoned.map(it =>
      '<a href="' + it.link + '" style="color:' + C.muted + ';text-decoration:none;font-weight:600;">' + it.cellRef + '</a>'
    ).join(" &nbsp;&middot;&nbsp; ");
    sections += sectionHead("Abandoned", "No real question or no reply", abandoned.length, "chat") +
      '<tr><td bgcolor="' + C.card + '" style="background:' + C.card + ';border-radius:6px;padding:14px;font:400 14px/1.6 ' + FONT + ';color:' + C.muted + ';">' +
      links + '</td></tr>';
  }

  const html =
    '<div style="margin:0;padding:0;background:' + C.bg + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.bg + '" style="background:' + C.bg + ';">' +
    '<tr><td align="center" style="padding:40px 16px 48px;">' +
    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;">' +

      '<tr><td style="font:700 12px/1.4 ' + FONT + ';letter-spacing:1px;text-transform:uppercase;color:' + C.faint + ';">Daily Chat Digest</td></tr>' +
      '<tr><td style="font:800 28px/1.2 ' + FONT + ';color:' + C.ink + ';padding:16px 0 10px;">' + esc(productName) + ' Chat Summary</td></tr>' +
      '<tr><td style="font:400 14px/1.4 ' + FONT + ';color:' + C.muted + ';">' + longDate +
        ' &nbsp;&middot;&nbsp; <span style="display:inline-block;background:' + C.ink + ';color:#ffffff;font:700 12px/1 ' + FONT +
        ';padding:5px 8px;border-radius:10px;vertical-align:1px;">' + plural(items.length, "chat") + '</span></td></tr>' +
      (since ? '<tr><td style="font:400 12px/1.4 ' + FONT + ';color:' + C.faint + ';padding-top:8px;">' + since + '</td></tr>' : "") +

      '<tr><td style="padding:22px 0 0;"><div style="height:2px;line-height:2px;font-size:0;background:' + C.ink + ';">&nbsp;</div></td></tr>' +

      sections +

      '<tr><td style="padding:28px 0 20px;"><div style="height:2px;line-height:2px;font-size:0;background:' + C.ink + ';">&nbsp;</div></td></tr>' +
      '<tr><td align="center">' +
        '<a href="' + sheetUrl + '" style="display:inline-block;background:' + C.ink + ';color:#ffffff;font:700 14px/1 ' + FONT +
        ';padding:13px 24px;border-radius:4px;text-decoration:none;">View all in Sheets &#8599;</a>' +
      '</td></tr>' +

    '</table></td></tr></table></div>';

  // Plain-text fallback
  let text = productName + " Chat Summary\n" + longDate + " · " + plural(items.length, "chat") + "\n" + (since ? since + "\n" : "");
  SENTIMENT_SECTIONS.forEach(s => {
    const list = groups[s.key];
    if (!list.length) return;
    text += "\n" + s.title.toUpperCase() + " (" + list.length + ")\n";
    list.forEach(it => {
      text += "- " + it.cellRef + (it.time ? " " + it.time : "") + " [" + TAG_STYLE[it.tag].label + "] " + it.summary + "\n";
    });
  });
  if (abandoned.length) text += "\nABANDONED: " + abandoned.map(it => it.cellRef).join(", ") + "\n";
  text += "\nView all: " + sheetUrl + "\n";

  return { html, text };
}
