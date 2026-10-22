// Email shell mined from product-intelligence/Style Template/styleguide-email.html.
import { DigestError } from "./errors.js";
// The template's head/CSS and outer body are copied verbatim below, except text slots and .tfix.
export const FONT_HEADING = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FONT_BODY = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
export const BG = "#f5f3f1";
export const INK = "#222222";
export const MUTED = "#555555";
export const CAPTION = "#666666";
export const RULE = "#dddddd";
export const STRIPE = "#ece9e6";
export const CARD = "#fefefe";
export const STAT_LABEL = "#777777";
export const GREEN = "#2a8c4a";
export const RED = "#c0392b";
export const AMBER = "#c9922a";
export const BLUE = "#2980b9";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function head(title) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en" dir="ltr">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
    <title>${esc(title)}</title>

    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:AllowPNG/>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->

    <!-- Web fonts: hidden from Outlook to prevent Times New Roman fallback -->
    <!--[if !mso]><!-->
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    </style>
    <!--<![endif]-->

    <!-- Outlook-only font fallback -->
    <!--[if mso]>
    <style type="text/css">
        body, table, td, th, p, li, a, span {
            font-family: 'Segoe UI', Arial, sans-serif !important;
        }
        h1, h2, h3, h4, h5, h6 {
            font-family: 'Segoe UI', Arial, sans-serif !important;
        }
    </style>
    <![endif]-->

    <style type="text/css">
        /* ============================================
           EMAIL CLIENT RESETS
           ============================================ */
        #outlook a { padding: 0; }
        body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        td { border-collapse: collapse; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; -ms-interpolation-mode: bicubic; }
        p { margin: 0; Margin: 0; }
        a { color: #222222; }
        .ExternalClass { width: 100%; }
        .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }

        /* iOS auto-link overrides */
        a[x-apple-data-detectors] {
            color: inherit !important;
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }

        /* ============================================
           RESPONSIVE
           ============================================ */
        @media only screen and (max-width: 480px) {
            .email-container { width: 100% !important; max-width: 100% !important; }
            .fluid { width: 100% !important; max-width: 100% !important; height: auto !important; }
            .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; direction: ltr !important; }
            .stack-column-center { text-align: center !important; }
            .center-on-narrow { text-align: center !important; display: block !important; margin-left: auto !important; margin-right: auto !important; float: none !important; }
            table.center-on-narrow { display: inline-block !important; }
            .email-container td.body-cell { padding-left: 20px !important; padding-right: 20px !important; }
            .mobile-pad { padding-left: 20px !important; padding-right: 20px !important; }
            h1.email-h1 { font-size: 26px !important; }
            h2.email-h2 { font-size: 20px !important; }
            .mobile-full { width: 100% !important; }
            .mobile-hide { display: none !important; }
            .mobile-show { display: block !important; max-height: none !important; overflow: visible !important; }
            .avatar-col { max-width: 50% !important; width: 50% !important; }
            .avatar-circle { width: 48px !important; height: 48px !important; font-size: 18px !important; line-height: 48px !important; }
            .avatar-name { font-size: 12px !important; }
            .avatar-subtitle { font-size: 11px !important; }
            .stat-col { max-width: 50% !important; width: 50% !important; }
            .stat-value { font-size: 28px !important; }
            .stat-value-3 { font-size: 22px !important; }
            .stat-card-3 { padding-left: 6px !important; padding-right: 6px !important; }
            .bar-label-cell { width: 100px !important; font-size: 11px !important; }
            .contributor-col { display: block !important; width: 100% !important; max-width: 100% !important; }
        }

        /* ============================================
           DARK MODE — Apple Mail, iOS, macOS Mail
           ============================================ */
        @media (prefers-color-scheme: dark) {
            .body-bg { background-color: #1a1a18 !important; }
            .email-body-bg { background-color: #222220 !important; }
            .card-bg { background-color: #2a2927 !important; }
            .text-main { color: #e0ddd8 !important; }
            .heading-dm { color: #ece9e4 !important; }
            .text-muted { color: #a8a49e !important; }
            .email-link { color: #c8c4be !important; }
            .divider-line { border-color: #3a3835 !important; }
            .code-inline { background-color: #2a2927 !important; color: #e0ddd8 !important; border-color: #3a3835 !important; }
            .footer-bg { background-color: #1a1a18 !important; }
            .callout-info-bg { background-color: #2a2927 !important; border-color: #5a6a9a !important; }
            .callout-warning-bg { background-color: #2a2927 !important; }
            .callout-info-border { background-color: #5a6a9a !important; }
            .badge-bg { background-color: #3a3835 !important; color: #e0ddd8 !important; }
            .badge-outline { border-color: #5a5855 !important; color: #e0ddd8 !important; }
            .mark-bg { background-color: #4a4530 !important; color: #e0ddd8 !important; }
            .kbd-bg { background-color: #3a3835 !important; border-color: #5a5855 !important; color: #e0ddd8 !important; }
            .aside-bg { background-color: #2a2927 !important; }
            .table-stripe { background-color: #2a2927 !important; }
            .table-border { border-color: #3a3835 !important; }
            .btn-primary { background-color: #e0ddd8 !important; color: #1a1a18 !important; border-color: #e0ddd8 !important; }
            .btn-secondary { background-color: transparent !important; color: #e0ddd8 !important; border-color: #e0ddd8 !important; }
            .preheader-bg { background-color: #1a1a18 !important; }
            .header-border { border-color: #3a3835 !important; }
            .blockquote-border { background-color: #5a5855 !important; }
            .pullquote-border { border-color: #5a5855 !important; }
            .img-border { border-color: #3a3835 !important; }
            .avatar-name-dm { color: #ece9e4 !important; }
            .avatar-subtitle-dm { color: #a8a49e !important; }
            .stat-card-dm { background-color: #2a2927 !important; }
            .stat-label-dm { color: #a8a49e !important; }
            .timeline-border-dm { border-color: #3a3835 !important; }
            .timeline-text-dm { color: #e0ddd8 !important; }
            .timeline-time-dm { color: #a8a49e !important; }
            .bar-chart-dm { background-color: #2a2927 !important; }
            .bar-track-dm { background-color: #1a1a18 !important; }
            .bar-label-dm { color: #a8a49e !important; }
            .bar-title-dm { color: #a8a49e !important; }
            .contributor-card-dm { background-color: #2a2927 !important; }
            .contributor-meta-dm { color: #a8a49e !important; }
            .callout-critical-dm { background-color: #2a2220 !important; }
            .callout-positive-dm { background-color: #202a22 !important; }
            .callout-info-dm { background-color: #20242a !important; }
        }

        /* Outlook mobile dark mode */
        [data-ogsc] .body-bg { background-color: #1a1a18 !important; }
        [data-ogsc] .email-body-bg { background-color: #222220 !important; }
        [data-ogsc] .card-bg { background-color: #2a2927 !important; }
        [data-ogsc] .text-main { color: #e0ddd8 !important; }
        [data-ogsc] .heading-dm { color: #ece9e4 !important; }
        [data-ogsc] .text-muted { color: #a8a49e !important; }
        [data-ogsc] .email-link { color: #c8c4be !important; }
        [data-ogsc] .divider-line { border-color: #3a3835 !important; }
        [data-ogsc] .footer-bg { background-color: #1a1a18 !important; }
        [data-ogsc] .btn-primary { background-color: #e0ddd8 !important; color: #1a1a18 !important; }
        [data-ogsc] .btn-secondary { color: #e0ddd8 !important; border-color: #e0ddd8 !important; }
        [data-ogsc] .avatar-name-dm { color: #ece9e4 !important; }
        [data-ogsc] .avatar-subtitle-dm { color: #a8a49e !important; }
        [data-ogsc] .stat-card-dm { background-color: #2a2927 !important; }
        [data-ogsc] .stat-label-dm { color: #a8a49e !important; }
        [data-ogsc] .timeline-border-dm { border-color: #3a3835 !important; }
        [data-ogsc] .timeline-text-dm { color: #e0ddd8 !important; }
        [data-ogsc] .timeline-time-dm { color: #a8a49e !important; }
        [data-ogsc] .bar-chart-dm { background-color: #2a2927 !important; }
        [data-ogsc] .bar-track-dm { background-color: #1a1a18 !important; }
        [data-ogsc] .bar-label-dm { color: #a8a49e !important; }
        [data-ogsc] .contributor-card-dm { background-color: #2a2927 !important; }
        [data-ogsc] .contributor-meta-dm { color: #a8a49e !important; }
        [data-ogsc] .callout-critical-dm { background-color: #2a2220 !important; }
        [data-ogsc] .callout-positive-dm { background-color: #202a22 !important; }
        [data-ogsc] .callout-info-dm { background-color: #20242a !important; }
    </style>
    <style>
        .tfix { width: 100% !important; table-layout: fixed !important; }
    </style>
</head>`;
}
export function open_body(preheader) {
  return `<body style="margin:0; padding:0; background-color:#f5f3f1; width:100%; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;" class="body-bg">

    <!-- Preheader text (hidden) -->
    <div style="display:none; font-size:1px; color:#f5f3f1; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden; mso-hide:all;" class="preheader-bg">
        ${esc(preheader)}
        &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
    </div>

    <!-- Outer background table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f3f1;" class="body-bg">
    <tr>
    <td align="center" valign="top" style="padding:20px 10px;">

        <!-- Ghost table for Outlook -->
        <!--[if mso]>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center">
        <tr>
        <td>
        <![endif]-->

        <!-- Email container -->
        <div style="max-width:600px; width:100%; margin:0 auto;" class="email-container">


`;
}
export function close_body() {
  return `        </div>
        <!-- /Email container -->

        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->

    </td>
    </tr>
    </table>
    <!-- /Outer background table -->

</body>
</html>
`;
}

const PRESENTATION = 'role="presentation" cellspacing="0" cellpadding="0" border="0"';

export function section_open() {
  return `<table ${PRESENTATION} width="100%" style="background-color:${BG};" class="email-body-bg">`;
}

export function section_close() { return "</table>"; }

/** inner is composed HTML; text belongs in p(), small(), or another escaping helper. */
export function cell(inner, pad = "16px 40px 0 40px") {
  if (!/^[\d.px% ]+$/.test(pad)) throw new DigestError("Invalid cell padding");
  return `<tr><td style="padding:${pad};" class="body-cell">${inner}</td></tr>`;
}

export function h2(text) {
  return `<h2 class="email-h2 heading-dm" style="margin:0; Margin:0; font-family:${FONT_HEADING}; font-size:22px; font-weight:700; line-height:1.3; letter-spacing:-0.015em; color:${INK};">${esc(text)}</h2>`;
}

export function h3(text) {
  return `<h3 class="heading-dm" style="margin:0; Margin:0; font-family:${FONT_HEADING}; font-size:18px; font-weight:600; line-height:1.3; color:${INK};">${esc(text)}</h3>`;
}

export function p(text) {
  return `<p style="margin:0; Margin:0; font-family:${FONT_BODY}; font-size:16px; line-height:1.6; letter-spacing:0.01em; color:${INK};" class="text-main">${esc(text)}</p>`;
}

export function lead(text) {
  return `<p style="margin:0; Margin:0; font-family:${FONT_BODY}; font-size:18px; line-height:1.55; color:${MUTED};" class="text-muted">${esc(text)}</p>`;
}

export function small(text) {
  return `<p style="margin:0; Margin:0; font-family:${FONT_BODY}; font-size:13px; line-height:1.5; color:${CAPTION};" class="text-muted">${esc(text)}</p>`;
}

export function masthead(eyebrow, title, leadText = null, caption = null) {
  return section_open() +
    `<tr><td style="padding:40px 40px 10px 40px; text-align:left;" class="body-cell"><p style="margin:0; Margin:0; font-family:${FONT_HEADING}; font-size:12px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:${MUTED};" class="text-muted heading-dm">${esc(eyebrow)}</p></td></tr>` +
    cell(`<h1 class="email-h1 heading-dm text-main" style="margin:0; Margin:0; font-family:${FONT_HEADING}; font-size:30px; font-weight:700; line-height:1.1; letter-spacing:-0.02em; color:${INK};">${esc(title)}</h1>`, "10px 40px 0 40px") +
    (leadText == null ? "" : cell(lead(leadText))) +
    (caption == null ? "" : cell(small(caption))) +
    cell(`<table ${PRESENTATION} width="100%"><tr><td style="border-top:2px solid ${INK}; font-size:1px; line-height:1px; mso-line-height-rule:exactly;" class="header-border">&nbsp;</td></tr></table>`, "24px 40px 0 40px") +
    section_close();
}

/** Plain cells are escaped. Use {html: trustedFragment} only for shell-generated markup. */
export function table(headers, rows, aligns = null, striped = true, widths = null) {
  function alignment(index) {
    const align = aligns?.[index] ?? "left";
    if (!["left", "center", "right"].includes(align)) throw new DigestError("Invalid table alignment");
    return align;
  }
  const heading = headers.map((label, index) => {
    const width = widths?.[index];
    if (width != null && !/^\d+(?:\.\d+)?%?$/.test(String(width))) throw new DigestError("Invalid table width");
    return `<th align="${alignment(index)}"${width == null ? "" : ` width="${esc(width)}"`} style="padding:10px 12px; font-family:${FONT_HEADING}; font-weight:600; font-size:13px; text-transform:uppercase; letter-spacing:0.03em; border-bottom:2px solid ${INK}; white-space:nowrap; color:${INK};" class="heading-dm header-border">${esc(label)}</th>`;
  }).join("");
  const body = rows.map((row, rowIndex) => {
    const stripe = striped && rowIndex % 2 === 0 ? ` style="background-color:${STRIPE};" class="table-stripe"` : "";
    return `<tr${stripe}>` + row.map((value, index) => {
      const inner = value && typeof value === "object" && Object.hasOwn(value, "html") ? value.html : esc(value);
      const align = aligns?.[index] == null ? "" : ` align="${alignment(index)}"`;
      return `<td${align} style="padding:10px 12px;${striped ? "" : ` border-bottom:1px solid ${RULE};`}"${striped ? "" : ' class="divider-line"'}>${inner}</td>`;
    }).join("") + "</tr>";
  }).join("");
  return `<table cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family:${FONT_BODY}; font-size:14px; line-height:1.5; color:${INK}; border-collapse:collapse;" class="text-main"><tr>${heading}</tr>${body}</table>`;
}

function cssColor(value) {
  if (!/^#[\da-f]{6}$/i.test(value)) throw new DigestError("Invalid color");
  return value;
}

function statRows(count) {
  if (count <= 3) return [count];
  if (count === 4) return [2, 2];
  const sizes = Array(Math.floor(count / 3)).fill(3);
  if (count % 3) sizes.push(count % 3);
  return sizes;
}

/** Plain table rows of stat cards; place inside cell(). */
export function stat_grid(stats) {
  const values = Array.from(stats);
  if (!values.length) return "";
  let html = "";
  let position = 0;
  for (const size of statRows(values.length)) {
    const row = values.slice(position, position + size);
    position += size;
    const three = size === 3;
    const valueHook = "stat-value heading-dm" + (three ? " stat-value-3" : "");
    const cardHook = "stat-card-dm" + (three ? " stat-card-3" : "");
    const cellWidth = `${Number((100 / size).toPrecision(4))}%`;
    html += `<table ${PRESENTATION} width="100%" align="center" style="width:100%; max-width:${168 * size}px; margin:0 auto; table-layout:fixed;" class="stat-row"><tr>`;
    html += row.map(([value, label, color = INK]) =>
      `<td width="${cellWidth}" valign="top" align="center" style="padding:4px;" class="stat-cell"><table ${PRESENTATION} width="100%"><tr><td bgcolor="${CARD}" style="background-color:${CARD}; padding:16px 12px; text-align:center;" class="${cardHook}"><p style="margin:0; Margin:0; font-family:${FONT_HEADING}; font-size:32px; font-weight:700; line-height:1.1; white-space:nowrap; color:${cssColor(color)};" class="${valueHook}">${esc(value)}</p><p style="margin:4px 0 0 0; Margin:4px 0 0 0; font-family:${FONT_HEADING}; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:${STAT_LABEL};" class="stat-label-dm">${esc(label)}</p></td></tr></table></td>`
    ).join("");
    html += "</tr></table>\n";
  }
  return html;
}

export function badge(text, variant = "default", color = null) {
  const variants = {
    default: { padding: "5px 10px", bg: "#e8e6e3", color: INK, classes: "badge-bg", border: "" },
    outline: { padding: "4px 9px", bg: "transparent", color: INK, classes: "badge-outline", border: " border:1px solid #888888;" },
    muted: { padding: "5px 10px", bg: "#dddad7", color: MUTED, classes: "badge-bg text-muted", border: "" },
    critical: { padding: "5px 10px", bg: "#fdf0ee", color: RED, classes: "callout-critical-dm", border: "" },
    warning: { padding: "5px 10px", bg: "#faf3e6", color: "#8a6520", classes: "callout-warning-bg", border: "" },
    positive: { padding: "5px 10px", bg: "#f0f8f2", color: GREEN, classes: "callout-positive-dm", border: "" },
    info: { padding: "5px 10px", bg: "#eef5fb", color: BLUE, classes: "callout-info-bg", border: "" },
  };
  const style = variants[variant];
  if (!style) throw new DigestError("Invalid badge variant");
  return `<span style="display:inline-block; font-family:${FONT_HEADING}; font-size:11px; font-weight:600; line-height:1; padding:${style.padding}; border-radius:12px; background-color:${style.bg}; color:${color == null ? style.color : cssColor(color)}; text-transform:uppercase; letter-spacing:0.03em;${style.border}" class="${style.classes}">${esc(text)}</span>`;
}

/** body is plain text or an array of plain-text lines. */
export function callout(kind, title, body) {
  const variants = {
    note: { color: INK, titleColor: INK, bg: STRIPE, classes: "callout-info-bg", border: "callout-info-border", table: ' class="callout-info-bg"', weight: 600, tracking: "0.03em", lineHeight: "1.6" },
    warning: { color: AMBER, titleColor: "#8a6520", bg: "#faf3e6", classes: "callout-warning-bg", table: ' class="callout-warning-bg"', weight: 600, tracking: "0.03em", lineHeight: "1.6" },
    critical: { color: RED, titleColor: RED, bg: "#fdf0ee", classes: "callout-critical-dm", table: ' style="margin-bottom:16px;"', weight: 700, tracking: "0.04em", lineHeight: "1.55" },
    positive: { color: GREEN, titleColor: GREEN, bg: "#f0f8f2", classes: "callout-positive-dm", table: ' style="margin-bottom:16px;"', weight: 700, tracking: "0.04em", lineHeight: "1.55" },
    info: { color: BLUE, titleColor: BLUE, bg: "#eef5fb", classes: "callout-info-dm", table: "", weight: 700, tracking: "0.04em", lineHeight: "1.55" },
  };
  const style = variants[kind];
  if (!style) throw new DigestError("Invalid callout kind");
  const lines = (Array.isArray(body) ? body : [body]).map(esc).join("<br />");
  return `<table ${PRESENTATION} width="100%"${style.table}><tr><td width="4" bgcolor="${style.color}" style="background-color:${style.color};"${style.border ? ` class="${style.border}"` : ""}></td><td bgcolor="${style.bg}" style="background-color:${style.bg}; padding:16px 20px;" class="${style.classes}"><p style="margin:0; Margin:0 0 4px 0; font-family:${FONT_HEADING}; font-size:13px; font-weight:${style.weight}; text-transform:uppercase; letter-spacing:${style.tracking}; color:${style.titleColor};" class="heading-dm">${esc(title)}</p><p style="margin:0; Margin:0; font-family:${FONT_BODY}; font-size:15px; line-height:${style.lineHeight}; color:${INK};" class="text-main">${lines}</p></td></tr></table>`;
}

export function button(label, href, secondary = false) {
  const kind = secondary ? "btn-secondary" : "btn-primary";
  return `<table ${PRESENTATION}><tr><td style="border-radius:6px;${secondary ? "" : ` background-color:${INK};`}"${secondary ? "" : ` bgcolor="${INK}"`} class="${kind}"><a href="${esc(href)}" style="display:inline-block; padding:12px 28px; font-family:${FONT_HEADING}; font-size:15px; font-weight:600; line-height:1.2; color:${secondary ? INK : BG}; text-decoration:none; border-radius:6px; border:2px solid ${INK};${secondary ? " background-color:transparent;" : ""}" class="${kind}">${esc(label)}</a></td></tr></table>`;
}

export function divider() {
  return `<table ${PRESENTATION} width="100%"><tr><td style="border-top:1px solid ${RULE}; font-size:1px; line-height:1px; mso-line-height-rule:exactly;" class="divider-line">&nbsp;</td></tr></table>`;
}

export function spacer() {
  return section_open() + '<tr><td style="padding:40px 0 0 0; font-size:1px; line-height:1px; mso-line-height-rule:exactly;">&nbsp;</td></tr>' + section_close();
}

export function footer(title, lines, links = [], addressLines = []) {
  return `<table ${PRESENTATION} width="100%"><tr><td bgcolor="${STRIPE}" style="background-color:${STRIPE}; padding:32px 40px; border-radius:0 0 6px 6px;" class="footer-bg body-cell"><p style="margin:0; Margin:0 0 8px 0; font-family:${FONT_HEADING}; font-size:13px; font-weight:600; color:${INK}; text-align:center;" class="heading-dm">${esc(title)}</p><p style="margin:0; Margin:0 0 16px 0; font-family:${FONT_BODY}; font-size:12px; line-height:1.5; color:${MUTED}; text-align:center;" class="text-muted">${lines.map(esc).join("<br />")}</p>${links.length ? `<p style="margin:0; Margin:0 0 8px 0; font-family:${FONT_BODY}; font-size:12px; line-height:1.5; color:${MUTED}; text-align:center;" class="text-muted">${links.map(([label, href]) => `<a href="${esc(href)}" style="color:${MUTED}; text-decoration:underline;" class="email-link">${esc(label)}</a>`).join(" &nbsp;&middot;&nbsp; ")}</p>` : ""}${addressLines.length ? `<p style="margin:0; Margin:0; font-family:${FONT_BODY}; font-size:11px; line-height:1.4; color:#888888; text-align:center;" class="text-muted">${addressLines.map(esc).join("<br />")}</p>` : ""}</td></tr></table>`;
}

/** bodyHtml and footerHtml contain composed HTML; all text slots escape at their helper. */
export function document(title, preheader, bodyHtml, footerHtml) {
  return head(title) + open_body(preheader) + bodyHtml + spacer() + footerHtml + close_body();
}
