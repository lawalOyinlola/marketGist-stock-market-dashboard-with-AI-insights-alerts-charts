import sanitizeHtml from "sanitize-html";

// Email HTML is built from tables with inline styles. Gmail strips <style>
// in some views, Outlook desktop renders with Word, and both ignore most
// modern CSS, so every component below works without the <style> block.
// The <style> block only adds mobile padding and a few client resets.

const COLORS = {
  page: "#0a0b0d",
  card: "#131519",
  raised: "#1b1e24",
  border: "#262a31",
  heading: "#f4f5f7",
  body: "#c9cfd6",
  muted: "#8b939e",
  accent: "#baf33c",
  onAccent: "#0a0b0d",
  up: "#22c55e",
  down: "#f87171",
  volume: "#fdd458",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// The logo has white lettering, so it needs the dark header behind it.
const LOGO_URL =
  "https://res.cloudinary.com/dnw48gzss/image/upload/v1761215474/logo-marketgist_xc1psm.png";
const DASHBOARD_PREVIEW_URL =
  "https://ik.imagekit.io/a6fkjou7d/dashboard-preview.png?updatedAt=1756378548102";

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

// Subjects and plain-text bodies are not HTML, but a CR or LF in a header
// value could start a new header, so strip them from anything user-supplied.
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

// Keeps link targets ("Read the full story: https://...") and bullets, which
// a plain tag strip would lose.
const toPlainText = (html: string) =>
  sanitizeHtml(
    html
      .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2: $1")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/(p|h3|h4|li|blockquote)>/gi, "$&\n"),
    { allowedTags: [], allowedAttributes: {} },
  )
    // sanitize-html escapes text on output. Decode &amp; last so an escaped
    // entity such as "&amp;lt;" is not decoded twice.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const formatUsd = (value: string) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
};

const percentFromTarget = (current: string, target: string) => {
  const c = Number(current);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t) || t === 0) return null;
  const pct = ((c - t) / t) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
};

const firstName = (name: string) => oneLine(name).split(/\s+/)[0] || "there";

// --- Building blocks --------------------------------------------------------

const heading = (html: string) =>
  `<h1 style="margin: 0 0 16px 0; font-family: ${FONT}; font-size: 26px; line-height: 1.25; font-weight: 700; color: ${COLORS.heading};">${html}</h1>`;

const paragraph = (html: string, { muted = false, size = 16 } = {}) =>
  `<p style="margin: 0 0 16px 0; font-family: ${FONT}; font-size: ${size}px; line-height: 1.6; color: ${muted ? COLORS.muted : COLORS.body};">${html}</p>`;

const badge = (label: string, color: string) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 20px 0;"><tr><td style="padding: 6px 12px; border: 1px solid ${color}; border-radius: 999px; font-family: ${FONT}; font-size: 12px; line-height: 1; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${color};">${label}</td></tr></table>`;

// A table cell with bgcolor keeps the button filled in Outlook desktop, which
// ignores background colors on links.
const button = (href: string, label: string) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 8px 0 24px 0;"><tr><td bgcolor="${COLORS.accent}" style="border-radius: 8px; background-color: ${COLORS.accent};"><a href="${href}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: ${FONT}; font-size: 16px; line-height: 1; font-weight: 700; color: ${COLORS.onAccent}; text-decoration: none; border-radius: 8px;">${label}</a></td></tr></table>`;

const textLink = (href: string, label: string, color: string = COLORS.accent) =>
  `<a href="${href}" target="_blank" style="color: ${color}; text-decoration: underline;">${label}</a>`;

// The large number at the top of an alert: label, value, and a line of context.
// It joins the facts() table below it into one card.
const headline = (label: string, value: string, color: string, note = "") =>
  `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 8px 0 0 0;"><tr><td bgcolor="${COLORS.raised}" style="padding: 24px; background-color: ${COLORS.raised}; border: 1px solid ${COLORS.border}; border-bottom: 0; border-radius: 12px 12px 0 0;">
<p style="margin: 0 0 6px 0; font-family: ${FONT}; font-size: 13px; line-height: 1.4; color: ${COLORS.muted};">${label}</p>
<p style="margin: 0; font-family: ${FONT}; font-size: 36px; line-height: 1.1; font-weight: 700; color: ${color};">${value}</p>
${note ? `<p style="margin: 8px 0 0 0; font-family: ${FONT}; font-size: 14px; line-height: 1.4; color: ${COLORS.body};">${note}</p>` : ""}
</td></tr></table>`;

// Label and value rows. Rows stay side by side at any width, so the block
// needs no mobile breakpoint.
const facts = (rows: { label: string; value: string; color?: string }[]) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 24px 0; border: 1px solid ${COLORS.border}; border-radius: 0 0 12px 12px;">${rows
    .map((row, i) => {
      const rule = i ? `border-top: 1px solid ${COLORS.border};` : "";
      return `<tr><td style="padding: 14px 24px; ${rule} white-space: nowrap; font-family: ${FONT}; font-size: 14px; line-height: 1.4; color: ${COLORS.muted};">${row.label}</td><td align="right" style="padding: 14px 24px; ${rule} font-family: ${FONT}; font-size: 15px; line-height: 1.4; font-weight: 600; color: ${row.color ?? COLORS.heading};">${row.value}</td></tr>`;
    })
    .join("")}</table>`;

const note = (html: string) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 24px 0;"><tr><td style="padding: 2px 0 2px 16px; border-left: 3px solid ${COLORS.border}; font-family: ${FONT}; font-size: 14px; line-height: 1.6; color: ${COLORS.muted};">${html}</td></tr></table>`;

const numberedList = (items: string[]) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 16px 0;">${items
    .map(
      (item, i) =>
        `<tr><td valign="top" width="28" style="padding: 0 0 14px 0; font-family: ${FONT}; font-size: 16px; line-height: 1.6; font-weight: 700; color: ${COLORS.accent};">${i + 1}.</td><td style="padding: 0 0 14px 0; font-family: ${FONT}; font-size: 16px; line-height: 1.6; color: ${COLORS.body};">${item}</td></tr>`,
    )
    .join("")}</table>`;

const rule = () =>
  `<hr style="margin: 28px 0; border: 0; border-top: 1px solid ${COLORS.border};">`;

type LayoutOptions = {
  title: string;
  preheader: string;
  body: string;
  appUrl: string;
  // Why this person got the email. Shown first in the footer.
  reason: string;
  // Marketing email only. Alerts link to alert settings instead, because
  // unsubscribing does not stop alerts. The password reset has neither.
  unsubscribeUrl?: string;
  manageUrl?: string;
};

const layout = ({
  title,
  preheader,
  body,
  appUrl,
  reason,
  unsubscribeUrl,
  manageUrl,
}: LayoutOptions) => {
  const footerLinks = [
    unsubscribeUrl
      ? textLink(escapeHtml(unsubscribeUrl), "Unsubscribe", COLORS.muted)
      : "",
    manageUrl
      ? textLink(escapeHtml(manageUrl), "Manage alerts", COLORS.muted)
      : "",
    textLink(appUrl, "Open Marketgist", COLORS.muted),
  ]
    .filter(Boolean)
    .join(" &nbsp;&middot;&nbsp; ");

  // The zero-width characters after the preheader stop inbox previews from
  // pulling in the first lines of the body after it.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${title}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media only screen and (max-width: 600px) {
    .outer { padding: 16px 8px !important; }
    .inner { padding: 28px 20px !important; }
  }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.page};">
<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${COLORS.page};">${preheader}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="${COLORS.page}" style="background-color: ${COLORS.page};">
<tr><td align="center" class="outer" style="padding: 32px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px;">
<tr><td style="padding: 8px 8px 24px 8px;">
<a href="${appUrl}" target="_blank"><img src="${LOGO_URL}" alt="Marketgist" width="144" style="display: block; width: 144px; max-width: 100%; height: auto; border: 0;"></a>
</td></tr>
<tr><td class="inner" bgcolor="${COLORS.card}" style="padding: 36px 40px; background-color: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 16px;">
${body}
</td></tr>
<tr><td style="padding: 24px 8px 0 8px;">
<p style="margin: 0 0 12px 0; font-family: ${FONT}; font-size: 13px; line-height: 1.6; color: ${COLORS.muted};">${reason}</p>
<p style="margin: 0 0 12px 0; font-family: ${FONT}; font-size: 13px; line-height: 1.6; color: ${COLORS.muted};">${footerLinks}</p>
<p style="margin: 0; font-family: ${FONT}; font-size: 13px; line-height: 1.6; color: ${COLORS.muted};">&copy; ${new Date().getUTCFullYear()} Marketgist</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

const textFooter = (reason: string, links: Record<string, string>) =>
  [
    "",
    "--",
    reason,
    ...Object.entries(links).map(([label, url]) => `${label}: ${url}`),
  ].join("\n");

// --- AI-written content -----------------------------------------------------

// Gemini writes the welcome intro and the news brief. Its output is
// untrusted: keep a short list of tags, drop every attribute except link
// targets, then apply this file's styles so the output matches the design.
export const renderRichText = (html: string) => {
  // Models sometimes wrap HTML in a markdown code fence, and the fallback
  // strings in the Inngest functions are plain text.
  const unfenced = html.replace(/^\s*```(?:html)?\s*|\s*```\s*$/g, "");
  const input = /<[a-z]/i.test(unfenced) ? unfenced : `<p>${unfenced}</p>`;
  return sanitizeHtml(input, {
    allowedTags: [
      "h3",
      "h4",
      "p",
      "ul",
      "ol",
      "li",
      "strong",
      "b",
      "em",
      "i",
      "a",
      "br",
      "blockquote",
      "hr",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["https", "http"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  })
    .replace(
      /<h3>/g,
      `<h3 style="margin: 32px 0 14px 0; font-family: ${FONT}; font-size: 13px; line-height: 1.4; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${COLORS.accent};">`,
    )
    .replace(
      /<h4>/g,
      `<h4 style="margin: 0 0 10px 0; font-family: ${FONT}; font-size: 18px; line-height: 1.4; font-weight: 700; color: ${COLORS.heading};">`,
    )
    .replace(
      /<p>/g,
      `<p style="margin: 0 0 16px 0; font-family: ${FONT}; font-size: 16px; line-height: 1.6; color: ${COLORS.body};">`,
    )
    .replace(
      /<(ul|ol)>/g,
      `<$1 style="margin: 0 0 16px 0; padding: 0 0 0 20px; font-family: ${FONT}; font-size: 16px; line-height: 1.6; color: ${COLORS.body};">`,
    )
    .replace(/<li>/g, `<li style="margin: 0 0 8px 0;">`)
    .replace(
      /<(strong|b)>/g,
      `<$1 style="font-weight: 700; color: ${COLORS.heading};">`,
    )
    .replace(
      /<blockquote>/g,
      `<blockquote style="margin: 0 0 16px 0; padding: 12px 16px; border-left: 3px solid ${COLORS.accent}; background-color: ${COLORS.raised}; font-family: ${FONT}; font-size: 15px; line-height: 1.6; color: ${COLORS.body};">`,
    )
    .replace(/<hr \/>|<hr>/g, rule())
    .replace(
      /<a ([^>]*)>/g,
      `<a $1 style="color: ${COLORS.accent}; font-weight: 600; text-decoration: underline;">`,
    );
};

// Sent when Finnhub returns no articles for a user. It goes through
// renderRichText like the AI output does.
export const NEWS_FALLBACK_CONTENT = `
<h3>Market update</h3>
<h4>We couldn't load today's news</h4>
<p>Our news source didn't return any articles this time. Your dashboard has live prices and the latest headlines in the meantime.</p>
`;

// --- Emails -----------------------------------------------------------------

export const welcomeEmail = ({
  name,
  intro,
  appUrl,
  unsubscribeUrl,
}: {
  name: string;
  intro: string;
  appUrl: string;
  unsubscribeUrl: string;
}): EmailContent => {
  const first = firstName(name);
  const reason =
    "You're getting this because you just created a Marketgist account.";
  const steps = [
    "Add the stocks you follow to your watchlist, so their prices and news sit on one screen.",
    "Set a price alert on one of them. We check prices every hour and email you when one crosses your number.",
    "Look out for your daily market brief. It summarises news about the stocks on your watchlist, or general market news while the list is empty.",
  ];

  const body = [
    heading(`Welcome to Marketgist, ${escapeHtml(first)}`),
    renderRichText(intro),
    `<img src="${DASHBOARD_PREVIEW_URL}" alt="The Marketgist dashboard with a watchlist, price chart and market news" width="518" style="display: block; width: 100%; max-width: 518px; height: auto; margin: 8px 0 28px 0; border: 1px solid ${COLORS.border}; border-radius: 12px;">`,
    paragraph(
      `<strong style="color: ${COLORS.heading};">Three things worth doing first</strong>`,
    ),
    numberedList(steps),
    button(appUrl, "Open your dashboard"),
    paragraph(
      "Marketgist gives you information, not investment advice. The decisions stay yours.",
      { muted: true, size: 14 },
    ),
  ].join("\n");

  return {
    subject: `Welcome to Marketgist, ${first}`,
    html: layout({
      title: "Welcome to Marketgist",
      preheader:
        "Your watchlist, price alerts and daily market brief are ready to set up.",
      body,
      appUrl,
      reason,
      unsubscribeUrl,
    }),
    text: [
      `Welcome to Marketgist, ${first}`,
      "",
      toPlainText(intro),
      "",
      "Three things worth doing first:",
      ...steps.map((step, i) => `${i + 1}. ${step}`),
      "",
      `Open your dashboard: ${appUrl}`,
      "",
      "Marketgist gives you information, not investment advice.",
      textFooter(reason, { Unsubscribe: unsubscribeUrl }),
    ].join("\n"),
  };
};

export const newsSummaryEmail = ({
  date,
  newsContent,
  appUrl,
  unsubscribeUrl,
}: {
  date: string;
  newsContent: string;
  appUrl: string;
  unsubscribeUrl: string;
}): EmailContent => {
  const day = oneLine(date);
  const reason =
    "You're getting this daily brief because you have a Marketgist account.";
  const disclaimer =
    "Summaries are written by AI from published news articles and can contain mistakes. Read the full story before you act on anything, and treat this as information, not investment advice.";

  const body = [
    badge("Daily brief", COLORS.accent),
    heading("Today's market brief"),
    paragraph(escapeHtml(day), { muted: true, size: 14 }),
    renderRichText(newsContent),
    rule(),
    paragraph(
      "Prices keep moving after this email goes out. Your dashboard has the live numbers.",
    ),
    button(appUrl, "Open your dashboard"),
    paragraph(disclaimer, { muted: true, size: 13 }),
  ].join("\n");

  return {
    subject: `Your market brief for ${day}`,
    html: layout({
      title: "Today's market brief",
      preheader: "The news behind the stocks you follow, in plain English.",
      body,
      appUrl,
      reason,
      unsubscribeUrl,
    }),
    text: [
      `Today's market brief, ${day}`,
      "",
      toPlainText(newsContent),
      "",
      `Open your dashboard: ${appUrl}`,
      "",
      disclaimer,
      textFooter(reason, { Unsubscribe: unsubscribeUrl }),
    ].join("\n"),
  };
};

export const priceAlertEmail = ({
  direction,
  symbol,
  company,
  currentPrice,
  targetPrice,
  timestamp,
  appUrl,
}: {
  direction: "upper" | "lower";
  symbol: string;
  company: string;
  currentPrice: string;
  targetPrice: string;
  timestamp: string;
  appUrl: string;
}): EmailContent => {
  const isUpper = direction === "upper";
  const color = isUpper ? COLORS.up : COLORS.down;
  const verb = isUpper ? "rose above" : "fell below";
  const ticker = oneLine(symbol).toUpperCase();
  const name = oneLine(company) || ticker;
  const price = formatUsd(currentPrice);
  const target = formatUsd(targetPrice);
  const checkedAt = formatTimestamp(timestamp);
  const diff = percentFromTarget(currentPrice, targetPrice);
  const stockUrl = `${appUrl}/stocks/${encodeURIComponent(ticker)}`;
  const manageUrl = `${appUrl}/watchlist`;
  const reason = `You're getting this because you set a price alert for ${ticker} on Marketgist.`;
  const summary = `You asked us to tell you when ${name} ${isUpper ? "went above" : "dropped below"} ${target}. At our last check it was trading at ${price}.`;
  const caveat =
    "Prices are checked once an hour, so the price now may be different.";

  const body = [
    badge(isUpper ? "Price alert &uarr;" : "Price alert &darr;", color),
    heading(`${escapeHtml(ticker)} ${verb} ${escapeHtml(target)}`),
    paragraph(escapeHtml(summary)),
    headline(
      "Price at last check",
      escapeHtml(price),
      color,
      diff ? `${escapeHtml(diff)} from your target` : "",
    ),
    facts([
      {
        label: "Stock",
        value: `${escapeHtml(ticker)} &middot; ${escapeHtml(name)}`,
      },
      { label: "Your target", value: escapeHtml(target) },
      { label: "Checked at", value: escapeHtml(checkedAt) },
    ]),
    button(stockUrl, `View ${escapeHtml(ticker)}`),
    note(
      `${caveat} You can change or turn off this alert from your ${textLink(manageUrl, "watchlist")}.`,
    ),
    paragraph("This alert is information, not investment advice.", {
      muted: true,
      size: 13,
    }),
  ].join("\n");

  return {
    subject: `${ticker} ${verb} your ${target} target`,
    html: layout({
      title: `${escapeHtml(ticker)} price alert`,
      preheader: escapeHtml(`${name} was at ${price} as of ${checkedAt}.`),
      body,
      appUrl,
      reason: escapeHtml(reason),
      manageUrl,
    }),
    text: [
      `${ticker} ${verb} ${target}`,
      "",
      summary,
      diff ? `That is ${diff} from your target.` : "",
      "",
      `Checked at: ${checkedAt}`,
      `View ${ticker}: ${stockUrl}`,
      "",
      `${caveat} This alert is information, not investment advice.`,
      textFooter(reason, { "Manage alerts": manageUrl }),
    ].join("\n"),
  };
};

export const volumeAlertEmail = ({
  symbol,
  company,
  currentVolume,
  averageVolume,
  currentPrice,
  changePercent,
  changeDirection,
  volumeSpike,
  alertMessage,
  timestamp,
  appUrl,
}: {
  symbol: string;
  company: string;
  currentVolume: string;
  averageVolume: string;
  currentPrice: string;
  changePercent: string;
  changeDirection: string;
  volumeSpike: string;
  alertMessage: string;
  timestamp: string;
  appUrl: string;
}): EmailContent => {
  const ticker = oneLine(symbol).toUpperCase();
  const name = oneLine(company) || ticker;
  const isUp = changeDirection === "+";
  const change = oneLine(changePercent).replace(/^[+-]/, "");
  const priceLine = `${formatUsd(currentPrice)} (${isUp ? "+" : "-"}${change}%)`;
  const volume = `${oneLine(currentVolume)}M`;
  const average = `${oneLine(averageVolume)}M`;
  const spike = oneLine(volumeSpike);
  const checkedAt = formatTimestamp(timestamp);
  const stockUrl = `${appUrl}/stocks/${encodeURIComponent(ticker)}`;
  const manageUrl = `${appUrl}/watchlist`;
  const reason = `You're getting this because you set a volume alert for ${ticker} on Marketgist.`;
  const explainer =
    "Heavy volume means more shares than usual are changing hands. It often follows news, an earnings report or a large fund buying or selling, but it doesn't tell you which way the price goes next. The headlines on the stock page are the quickest way to see what's behind it.";

  const body = [
    badge("Volume alert", COLORS.volume),
    heading(
      `${escapeHtml(ticker)} is trading ${escapeHtml(spike)} above normal`,
    ),
    paragraph(escapeHtml(oneLine(alertMessage))),
    headline(
      "Shares traded today",
      escapeHtml(volume),
      COLORS.volume,
      `The average is ${escapeHtml(average)}`,
    ),
    facts([
      {
        label: "Stock",
        value: `${escapeHtml(ticker)} &middot; ${escapeHtml(name)}`,
      },
      {
        label: "Price",
        value: escapeHtml(priceLine),
        color: isUp ? COLORS.up : COLORS.down,
      },
      { label: "Checked at", value: escapeHtml(checkedAt) },
    ]),
    paragraph(explainer),
    button(stockUrl, `View ${escapeHtml(ticker)}`),
    paragraph("This alert is information, not investment advice.", {
      muted: true,
      size: 13,
    }),
  ].join("\n");

  return {
    subject: `${ticker} volume is ${spike} above normal`,
    html: layout({
      title: `${escapeHtml(ticker)} volume alert`,
      preheader: escapeHtml(
        `${volume} shares traded against a ${average} average.`,
      ),
      body,
      appUrl,
      reason: escapeHtml(reason),
      manageUrl,
    }),
    text: [
      `${ticker} is trading ${spike} above normal`,
      "",
      oneLine(alertMessage),
      "",
      `Shares traded today: ${volume} (average ${average})`,
      `Price: ${priceLine}`,
      `Checked at: ${checkedAt}`,
      `View ${ticker}: ${stockUrl}`,
      "",
      explainer,
      "This alert is information, not investment advice.",
      textFooter(reason, { "Manage alerts": manageUrl }),
    ].join("\n"),
  };
};

export const inactiveReminderEmail = ({
  name,
  appUrl,
  unsubscribeUrl,
}: {
  name: string;
  appUrl: string;
  unsubscribeUrl: string;
}): EmailContent => {
  const first = firstName(name);
  const watchlistUrl = `${appUrl}/watchlist`;
  const reason =
    "You're getting this because you have a Marketgist account and haven't signed in for a while.";
  const lines = [
    "It's been a while since you signed in to Marketgist. Everything you set up is where you left it: your watchlist, your price alerts and your daily brief.",
    "The brief is built from your watchlist, so if the list is out of date, a couple of minutes of trimming it makes every brief after that more useful.",
  ];

  const body = [
    heading(`Your watchlist is still here, ${escapeHtml(first)}`),
    ...lines.map((line) => paragraph(line)),
    button(watchlistUrl, "Review your watchlist"),
    paragraph(
      "If you'd rather not get reminders like this one, unsubscribe below and we'll stop.",
      { muted: true, size: 14 },
    ),
  ].join("\n");

  return {
    subject: "Your Marketgist watchlist is still here",
    html: layout({
      title: "Your watchlist is still here",
      preheader: "Your watchlist and alerts are set up the way you left them.",
      body,
      appUrl,
      reason,
      unsubscribeUrl,
    }),
    text: [
      `Your watchlist is still here, ${first}`,
      "",
      lines.join("\n\n"),
      "",
      `Review your watchlist: ${watchlistUrl}`,
      textFooter(reason, { Unsubscribe: unsubscribeUrl }),
    ].join("\n"),
  };
};

export const passwordResetEmail = ({
  resetUrl,
  appUrl,
}: {
  resetUrl: string;
  appUrl: string;
}): EmailContent => {
  const reason =
    "You're getting this because someone asked to reset the password for the Marketgist account that uses this email address.";
  const ignore =
    "If you didn't ask for this, you can ignore this email. Your password stays the same unless someone opens the link and sets a new one.";
  const href = escapeHtml(resetUrl);

  const body = [
    heading("Reset your password"),
    paragraph(
      "We got a request to reset the password for your Marketgist account. Use the button below to choose a new one. The link expires in 1 hour.",
    ),
    button(href, "Choose a new password"),
    paragraph(
      `Button not working? Copy this link into your browser:<br><a href="${href}" target="_blank" style="color: ${COLORS.accent}; word-break: break-all;">${href}</a>`,
      { muted: true, size: 14 },
    ),
    note(ignore),
  ].join("\n");

  return {
    subject: "Reset your Marketgist password",
    html: layout({
      title: "Reset your password",
      preheader: "Use this link within 1 hour to choose a new password.",
      body,
      appUrl,
      reason,
    }),
    text: [
      "Reset your password",
      "",
      "We got a request to reset the password for your Marketgist account. Open this link to choose a new one. It expires in 1 hour.",
      "",
      resetUrl,
      "",
      ignore,
      textFooter(reason, {}),
    ].join("\n"),
  };
};
