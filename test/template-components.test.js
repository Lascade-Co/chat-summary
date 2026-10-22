import assert from "node:assert/strict";
import test from "node:test";
import { badge, button, callout, footer, head, masthead, stat_grid, table } from "../src/shell.js";

// Inline styles and structures from styleguide-email.html, sections A, F, I, K, M, O, P and Footer.
const headingFont = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
const bodyFont = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

function tags(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]]))
  );
}

test("header uses the canonical eyebrow, heading, lead and rule cells", () => {
  const html = masthead("Daily chat digest", "Travel Animator chat summary", "Tuesday · 4 chats");
  assert.deepEqual(tags(html, "td").filter(tag => tag.class === "body-cell").map(tag => tag.style), [
    "padding:40px 40px 10px 40px; text-align:left;",
    "padding:10px 40px 0 40px;",
    "padding:16px 40px 0 40px;",
    "padding:24px 40px 0 40px;",
  ]);
  assert.deepEqual(tags(html, "p"), [
    { style: `margin:0; Margin:0; font-family:${headingFont}; font-size:12px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#555555;`, class: "text-muted heading-dm" },
    { style: `margin:0; Margin:0; font-family:${bodyFont}; font-size:18px; line-height:1.55; color:#555555;`, class: "text-muted" },
  ]);
  assert.deepEqual(tags(html, "h1"), [{
    class: "email-h1 heading-dm text-main",
    style: `margin:0; Margin:0; font-family:${headingFont}; font-size:30px; font-weight:700; line-height:1.1; letter-spacing:-0.02em; color:#222222;`,
  }]);
  assert.deepEqual(tags(html, "td").at(-1), {
    style: "border-top:2px solid #222222; font-size:1px; line-height:1px; mso-line-height-rule:exactly;", class: "header-border",
  });
});

test("striped table matches the canonical table, header, cell and alternating stripe markup", () => {
  const html = table(["Chat", "Summary"], [["C12", "One"], ["C13", "Two"], ["C14", "Three"]]);
  assert.deepEqual(tags(html, "table"), [{
    cellspacing: "0", cellpadding: "0", border: "0", width: "100%",
    style: `font-family:${bodyFont}; font-size:14px; line-height:1.5; color:#222222; border-collapse:collapse;`, class: "text-main",
  }]);
  assert.deepEqual(tags(html, "th"), Array.from({ length: 2 }, () => ({
    align: "left",
    style: `padding:10px 12px; font-family:${headingFont}; font-weight:600; font-size:13px; text-transform:uppercase; letter-spacing:0.03em; border-bottom:2px solid #222222; word-break:normal; overflow-wrap:normal; hyphens:none; color:#222222;`,
    class: "heading-dm header-border",
  })));
  assert.deepEqual(tags(html, "tr"), [{}, { style: "background-color:#ece9e6;", class: "table-stripe" }, {}, { style: "background-color:#ece9e6;", class: "table-stripe" }]);
  assert.deepEqual(tags(html, "td"), Array.from({ length: 6 }, () => ({ style: "padding:10px 12px;" })));
  assert.deepEqual(tags(table(["Chat"], [["C12"]], null, false), "td"), [{
    style: "padding:10px 12px; border-bottom:1px solid #dddddd;", class: "divider-line",
  }]);
});

const statLayouts = [
  [1, [{ count: 1, width: "100%", maxWidth: "168px" }]],
  [2, [{ count: 2, width: "50%", maxWidth: "336px" }]],
  [3, [{ count: 3, width: "33.33%", maxWidth: "504px" }]],
  [4, [{ count: 2, width: "50%", maxWidth: "336px" }, { count: 2, width: "50%", maxWidth: "336px" }]],
  [5, [{ count: 3, width: "33.33%", maxWidth: "504px" }, { count: 2, width: "50%", maxWidth: "336px" }]],
  [6, [{ count: 3, width: "33.33%", maxWidth: "504px" }, { count: 3, width: "33.33%", maxWidth: "504px" }]],
  [7, [{ count: 3, width: "33.33%", maxWidth: "504px" }, { count: 3, width: "33.33%", maxWidth: "504px" }, { count: 1, width: "100%", maxWidth: "168px" }]],
];

for (const [count, layout] of statLayouts) {
  test(`stat grid keeps ${count} cards in plain table rows of ${layout.map(row => row.count).join(" + ")}`, () => {
    const html = stat_grid(Array.from({ length: count }, (_, index) => [index + 1, `Metric ${index + 1}`, "#222222"]));
    const starts = [...html.matchAll(/<table\b[^>]*class="stat-row">/g)];
    const rows = starts.map((match, index) => html.slice(match.index, starts[index + 1]?.index ?? html.length));
    assert.equal(rows.length, layout.length);
    assert.ok(html.startsWith('<table role="presentation"'));
    assert.ok(html.endsWith("</tr></table>\n"));
    assert.doesNotMatch(html, /display:inline-block|<div\b|<!--\[if mso\]/);
    assert.equal(tags(html, "table").length, count + layout.length);
    assert.equal(tags(html, "td").length, count * 2);
    assert.deepEqual([...html.matchAll(/class="stat-label-dm">([^<]*)<\/p>/g)].map(match => match[1]),
      Array.from({ length: count }, (_, index) => `Metric ${index + 1}`));
    rows.forEach((row, index) => {
      const expected = layout[index];
      assert.deepEqual(tags(row, "table")[0], {
        role: "presentation", cellspacing: "0", cellpadding: "0", border: "0", width: "100%", align: "center",
        style: `width:100%; max-width:${expected.maxWidth}; margin:0 auto; table-layout:fixed;`, class: "stat-row",
      });
      assert.deepEqual(tags(row, "td").filter(tag => tag.class === "stat-cell"), Array.from({ length: expected.count }, () => ({
        width: expected.width, valign: "top", align: "center", style: "padding:4px;", class: "stat-cell",
      })));
      assert.deepEqual(tags(row, "td").filter(tag => tag.class?.includes("stat-card-dm")), Array.from({ length: expected.count }, () => ({
        bgcolor: "#fefefe", style: "background-color:#fefefe; padding:16px 12px; text-align:center;",
        class: expected.count === 3 ? "stat-card-dm stat-card-3" : "stat-card-dm",
      })));
      assert.deepEqual(tags(row, "p").filter(tag => tag.class?.includes("stat-value")).map(tag => tag.class),
        Array(expected.count).fill(expected.count === 3 ? "stat-value heading-dm stat-value-3" : "stat-value heading-dm"));
    });
  });
}

test("empty stat grids emit no markup", () => {
  assert.equal(stat_grid([]), "");
});

test("stat cards retain canonical typography and escaped values, labels and colours", () => {
  const html = stat_grid([["<3>", "Negative & urgent", "#c0392b"], [4, "Neutral", "#222222"], [5, "Positive", "#2a8c4a"]]);
  assert.deepEqual(tags(html, "p"), ["#c0392b", "#222222", "#2a8c4a"].flatMap(color => [
    { style: `margin:0; Margin:0; font-family:${headingFont}; font-size:32px; font-weight:700; line-height:1.1; white-space:nowrap; color:${color};`, class: "stat-value heading-dm stat-value-3" },
    { style: `margin:4px 0 0 0; Margin:4px 0 0 0; font-family:${headingFont}; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#777777;`, class: "stat-label-dm" },
  ]));
  assert.match(html, />&lt;3&gt;<\/p>/);
  assert.match(html, />Negative &amp; urgent<\/p>/);
});

test("three-card rows use narrower typography and padding inside the phone media query", () => {
  const mobile = head("Mobile digest").match(/@media only screen and \(max-width: 480px\) \{([\s\S]*?)\n        \}/);
  assert.ok(mobile);
  assert.match(mobile[1], /\.stat-value-3 \{ font-size: 22px !important; \}/);
  assert.match(mobile[1], /\.stat-card-3 \{ padding-left: 6px !important; padding-right: 6px !important; \}/);
});

test("badge variants retain the template's sizes, padding, backgrounds and borders", () => {
  const prefix = `display:inline-block; font-family:${headingFont}; font-size:11px; font-weight:600; line-height:1; `;
  const variants = [
    ["default", "padding:5px 10px; border-radius:12px; background-color:#e8e6e3; color:#222222; text-transform:uppercase; letter-spacing:0.03em;", "badge-bg"],
    ["outline", "padding:4px 9px; border-radius:12px; background-color:transparent; color:#222222; text-transform:uppercase; letter-spacing:0.03em; border:1px solid #888888;", "badge-outline"],
    ["muted", "padding:5px 10px; border-radius:12px; background-color:#dddad7; color:#555555; text-transform:uppercase; letter-spacing:0.03em;", "badge-bg text-muted"],
  ];
  for (const [variant, suffix, classes] of variants) {
    const html = badge("<status>", variant);
    assert.deepEqual(tags(html, "span"), [{ style: prefix + suffix, class: classes }]);
    assert.match(html, />&lt;status&gt;<\/span>/);
  }
});

for (const [variant, background, color, classes] of [
  ["critical", "#fdf0ee", "#c0392b", "callout-critical-dm badge-critical-dm"],
  ["warning", "#faf3e6", "#8a6520", "callout-warning-bg badge-warning-dm"],
  ["positive", "#f0f8f2", "#2a8c4a", "callout-positive-dm badge-positive-dm"],
  ["info", "#eef5fb", "#2980b9", "callout-info-bg badge-info-dm"],
]) {
  test(`${variant} badges use the semantic colours and default pill shape`, () => {
    const html = badge("<status>", variant);
    assert.deepEqual(tags(html, "span"), [{
      style: `display:inline-block; font-family:${headingFont}; font-size:11px; font-weight:600; line-height:1; padding:5px 10px; border-radius:12px; background-color:${background}; color:${color}; text-transform:uppercase; letter-spacing:0.03em;`,
      class: classes,
    }]);
    assert.match(html, />&lt;status&gt;<\/span>/);
  });
}

const darkBadgeColors = [
  ["critical", "#f0a094"],
  ["warning", "#e6c27a"],
  ["positive", "#8fd3a5"],
  ["info", "#9cc9ec"],
];

test("semantic badge text colours override inline colours inside the dark-mode media query", () => {
  const html = head("Dark-mode digest");
  const dark = html.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n        \}/);
  assert.ok(dark);
  const colors = [...dark[1].matchAll(/^\s*\.badge-(critical|warning|positive|info)-dm\s*\{\s*color:\s*(#[a-f0-9]{6}) !important;\s*\}/gm)]
    .map(([, variant, color]) => [variant, color]);
  assert.deepEqual(colors, darkBadgeColors);
});

test("Outlook badge text colours are scoped to data-ogsc outside the dark-mode media query", () => {
  const html = head("Outlook dark-mode digest");
  const dark = html.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n        \}/);
  assert.ok(dark);
  const outside = html.replace(dark[0], "");
  const colors = [...outside.matchAll(/^\s*\[data-ogsc\] \.badge-(critical|warning|positive|info)-dm\s*\{\s*color:\s*(#[a-f0-9]{6}) !important;\s*\}/gm)]
    .map(([, variant, color]) => [variant, color]);
  assert.deepEqual(colors, darkBadgeColors);
  assert.doesNotMatch(outside, /^\s*\.badge-(critical|warning|positive|info)-dm\s*\{/m);
});

test("callouts match each canonical variant and escape multiline attention content", () => {
  const variants = [
    ["note", "#222222", "#ece9e6", "callout-info-bg", "#222222", 600, "0.03em", "1.6"],
    ["warning", "#c9922a", "#faf3e6", "callout-warning-bg", "#8a6520", 600, "0.03em", "1.6"],
    ["critical", "#c0392b", "#fdf0ee", "callout-critical-dm", "#c0392b", 700, "0.04em", "1.55"],
    ["positive", "#2a8c4a", "#f0f8f2", "callout-positive-dm", "#2a8c4a", 700, "0.04em", "1.55"],
    ["info", "#2980b9", "#eef5fb", "callout-info-dm", "#2980b9", 700, "0.04em", "1.55"],
  ];
  for (const [kind, bar, background, classes, titleColor, weight, tracking, lineHeight] of variants) {
    const html = callout(kind, "<Needs attention>", ["C12 · <refund>", "C13 · A & B"]);
    const tableAttributes = { role: "presentation", cellspacing: "0", cellpadding: "0", border: "0", width: "100%" };
    if (["note", "warning"].includes(kind)) tableAttributes.class = classes;
    if (["critical", "positive"].includes(kind)) tableAttributes.style = "margin-bottom:16px;";
    assert.deepEqual(tags(html, "table"), [tableAttributes]);
    const barAttributes = { width: "4", bgcolor: bar, style: `background-color:${bar};` };
    if (kind === "note") barAttributes.class = "callout-info-border";
    assert.deepEqual(tags(html, "td"), [barAttributes, {
      bgcolor: background, style: `background-color:${background}; padding:16px 20px;`, class: classes,
    }]);
    assert.deepEqual(tags(html, "p"), [
      { style: `margin:0; Margin:0 0 4px 0; font-family:${headingFont}; font-size:13px; font-weight:${weight}; text-transform:uppercase; letter-spacing:${tracking}; color:${titleColor};`, class: "heading-dm" },
      { style: `margin:0; Margin:0; font-family:${bodyFont}; font-size:15px; line-height:${lineHeight}; color:#222222;`, class: "text-main" },
    ]);
    assert.match(html, /&lt;Needs attention&gt;/);
    assert.match(html, /C12 · &lt;refund&gt;<br \/>C13 · A &amp; B/);
  }
});

test("buttons match primary and secondary template components", () => {
  for (const secondary of [false, true]) {
    const html = button("<View>", 'https://example.test/?q="a"&b=2', secondary);
    assert.deepEqual(tags(html, "td"), [secondary
      ? { style: "border-radius:6px;", class: "btn-secondary" }
      : { style: "border-radius:6px; background-color:#222222;", bgcolor: "#222222", class: "btn-primary" }
    ]);
    assert.deepEqual(tags(html, "a"), [{
      href: "https://example.test/?q=&quot;a&quot;&amp;b=2",
      style: `display:inline-block; padding:12px 28px; font-family:${headingFont}; font-size:15px; font-weight:600; line-height:1.2; color:${secondary ? "#222222" : "#f5f3f1"}; text-decoration:none; border-radius:6px; border:2px solid #222222;${secondary ? " background-color:transparent;" : ""}`,
      class: secondary ? "btn-secondary" : "btn-primary",
    }]);
    assert.match(html, />&lt;View&gt;<\/a>/);
  }
});

test("footer uses canonical title, description, links, attribution and rounded corners", () => {
  const html = footer("<Title>", ["<Description>", "Second line"], [["<Sheets>", 'https://example.test/?q="x"']], ["<Report date>", "Second attribution"]);
  assert.deepEqual(tags(html, "td"), [{
    bgcolor: "#ece9e6", style: "background-color:#ece9e6; padding:32px 40px; border-radius:0 0 6px 6px;", class: "footer-bg body-cell",
  }]);
  assert.deepEqual(tags(html, "p"), [
    { style: `margin:0; Margin:0 0 8px 0; font-family:${headingFont}; font-size:13px; font-weight:600; color:#222222; text-align:center;`, class: "heading-dm" },
    { style: `margin:0; Margin:0 0 16px 0; font-family:${bodyFont}; font-size:12px; line-height:1.5; color:#555555; text-align:center;`, class: "text-muted" },
    { style: `margin:0; Margin:0 0 8px 0; font-family:${bodyFont}; font-size:12px; line-height:1.5; color:#555555; text-align:center;`, class: "text-muted" },
    { style: `margin:0; Margin:0; font-family:${bodyFont}; font-size:11px; line-height:1.4; color:#888888; text-align:center;`, class: "text-muted" },
  ]);
  assert.deepEqual(tags(html, "a"), [{
    href: "https://example.test/?q=&quot;x&quot;", style: "color:#555555; text-decoration:underline;", class: "email-link",
  }]);
  assert.match(html, /&lt;Description&gt;<br \/>Second line/);
  assert.match(html, /&lt;Report date&gt;<br \/>Second attribution/);
  assert.doesNotMatch(html, /<Title>|<Description>|<Sheets>|<Report date>/);
});
