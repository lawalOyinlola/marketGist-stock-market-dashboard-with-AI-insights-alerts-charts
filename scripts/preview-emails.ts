// Renders every email with sample data into .email-previews/ so the design
// can be checked in a browser without sending anything.
// Run: pnpm email:preview, then open .email-previews/index.html
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  welcomeEmail,
  newsSummaryEmail,
  priceAlertEmail,
  volumeAlertEmail,
  inactiveReminderEmail,
  passwordResetEmail,
  NEWS_FALLBACK_CONTENT,
  type EmailContent,
} from "../lib/mailer/templates";

const appUrl = "https://marketgist.vercel.app";
const unsubscribeUrl = `${appUrl}/unsubscribe?email=ada%40example.com&token=sample`;
const timestamp = "2026-10-28T14:00:00.000Z";

const sampleNews = `<h3>Companies on your watchlist</h3>
<h4>Apple's quarterly sales beat forecasts</h4>
<ul>
<li>Apple reported higher iPhone and services sales than analysts expected for the quarter.</li>
<li>Services, which include the App Store and iCloud, grew faster than hardware.</li>
</ul>
<blockquote><strong>Bottom line:</strong> More of Apple's income now comes from subscriptions, which tends to be steadier than device sales.</blockquote>
<p><a href="https://example.com/apple">Read the full story</a></p>
<hr>
<h4>Nvidia shares slip after export rule news</h4>
<ul>
<li>New rules limit which chips can be sold to some overseas buyers.</li>
<li>The company said it expects a smaller hit than in the last round of rules.</li>
</ul>
<blockquote><strong>Bottom line:</strong> The rules affect part of Nvidia's sales, so the stock may stay jumpy while details come out.</blockquote>
<p><a href="https://example.com/nvidia">Read the full story</a></p>
<h3>Economy</h3>
<h4>Inflation cooled slightly last month</h4>
<ul>
<li>Consumer prices rose a little less than economists expected.</li>
<li>Slower inflation can make it easier for the central bank to cut interest rates.</li>
</ul>
<blockquote><strong>Bottom line:</strong> Lower rates usually help company profits and stock prices, but one month of data rarely settles it.</blockquote>
<p><a href="https://example.com/cpi">Read the full story</a></p>`;

const emails: Record<string, EmailContent> = {
  welcome: welcomeEmail({
    name: "Ada Lovelace",
    intro:
      "<p>Thanks for joining Marketgist. Since you're building a <strong>long-term retirement portfolio</strong> with a <strong>conservative</strong> approach, your watchlist and daily brief will keep the steady movers in view without the day-to-day noise.</p>",
    appUrl,
    unsubscribeUrl,
  }),
  "news-summary": newsSummaryEmail({
    date: "Wednesday, October 28, 2026",
    newsContent: sampleNews,
    appUrl,
    unsubscribeUrl,
  }),
  "news-fallback": newsSummaryEmail({
    date: "Wednesday, October 28, 2026",
    newsContent: NEWS_FALLBACK_CONTENT,
    appUrl,
    unsubscribeUrl,
  }),
  "price-alert-upper": priceAlertEmail({
    direction: "upper",
    symbol: "AAPL",
    company: "Apple Inc",
    currentPrice: "231.42",
    targetPrice: "230",
    timestamp,
    appUrl,
  }),
  "price-alert-lower": priceAlertEmail({
    direction: "lower",
    symbol: "TSLA",
    company: "Tesla Inc",
    currentPrice: "198.1",
    targetPrice: "200",
    timestamp,
    appUrl,
  }),
  "volume-alert": volumeAlertEmail({
    symbol: "NVDA",
    company: "NVIDIA Corp",
    currentVolume: "412.6",
    averageVolume: "210.3",
    currentPrice: "141.25",
    changePercent: "3.4",
    changeDirection: "+",
    volumeSpike: "96%",
    alertMessage: "Trading volume today is almost twice the 30-day average.",
    timestamp,
    appUrl,
  }),
  "inactive-reminder": inactiveReminderEmail({
    name: "Ada Lovelace",
    appUrl,
    unsubscribeUrl,
  }),
  "password-reset": passwordResetEmail({
    resetUrl: `${appUrl}/reset-password?token=sample-token`,
    appUrl,
  }),
};

const outDir = join(process.cwd(), ".email-previews");
mkdirSync(outDir, { recursive: true });

for (const [name, email] of Object.entries(emails)) {
  writeFileSync(join(outDir, `${name}.html`), email.html);
  writeFileSync(
    join(outDir, `${name}.txt`),
    `Subject: ${email.subject}\n\n${email.text}\n`,
  );
}

const index = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Email previews</title></head>
<body style="font-family: system-ui, sans-serif; padding: 24px;">
<h1>Marketgist email previews</h1>
<ul>${Object.entries(emails)
  .map(
    ([name, email]) =>
      `<li><a href="${name}.html">${name}</a> (<a href="${name}.txt">text</a>): ${email.subject.replace(/</g, "&lt;")}</li>`,
  )
  .join("")}</ul>
</body></html>`;
writeFileSync(join(outDir, "index.html"), index);

console.log(`Wrote ${Object.keys(emails).length} previews to ${outDir}`);
