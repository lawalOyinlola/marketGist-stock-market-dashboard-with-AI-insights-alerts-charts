import { Resend } from "resend";
import {
  WELCOME_EMAIL_TEMPLATE,
  NEWS_SUMMARY_EMAIL_TEMPLATE,
  STOCK_ALERT_UPPER_EMAIL_TEMPLATE,
  STOCK_ALERT_LOWER_EMAIL_TEMPLATE,
  VOLUME_ALERT_EMAIL_TEMPLATE,
  INACTIVE_USER_REMINDER_EMAIL_TEMPLATE,
} from "@/lib/mailer/templates";
import sanitizeHtml from "sanitize-html";
import { isUserUnsubscribed, getUnsubscribeUrl } from "@/lib/utils/email";

// Resend allows 2 requests per second by default. Space sends out so a loop
// over many users stays under that, and retry once Resend still says no.
const MIN_SEND_INTERVAL_MS = 550;
const MAX_ATTEMPTS = 4;
let nextSendAt = 0;
let resendClient: Resend | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY must be set");
  return (resendClient ??= new Resend(apiKey));
};

type SendEmailOptions = {
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

// Resend's SDK returns { error } instead of throwing. Throw here so callers,
// and Inngest retries, see a failed send as a failure.
export const sendEmail = async ({ fromName, ...message }: SendEmailOptions) => {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) throw new Error("EMAIL_FROM must be set");

  for (let attempt = 1; ; attempt++) {
    const now = Date.now();
    const wait = Math.max(0, nextSendAt - now);
    nextSendAt = Math.max(now, nextSendAt) + MIN_SEND_INTERVAL_MS;
    if (wait > 0) await sleep(wait);

    const { error } = await getResend().emails.send({
      from: `${fromName} <${fromAddress}>`,
      ...message,
    });
    if (!error) return;

    if (error.name === "rate_limit_exceeded" && attempt < MAX_ATTEMPTS) {
      await sleep(1000 * attempt);
      continue;
    }
    throw new Error(`Resend ${error.name}: ${error.message}`);
  }
};

const sanitizeRich = (html: string) => {
  // First sanitize the HTML
  const sanitized = sanitizeHtml(html, {
    allowedTags: ["b", "i", "em", "strong", "p", "br", "ul", "ol", "li", "a"],
    allowedAttributes: { a: ["href", "rel", "target"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });

  // Add inline styles for better readability
  // Add color to paragraphs and list items
  return sanitized
    .replace(
      /<p>/g,
      '<p style="color: #333333; margin: 0 0 15px 0; font-size: 16px; line-height: 1.6;">'
    )
    .replace(
      /<li>/g,
      '<li style="color: #333333; margin: 0 0 10px 0; font-size: 16px; line-height: 1.6;">'
    )
    .replace(/<strong>/g, '<strong style="color: #000000; font-weight: 600;">')
    .replace(/<em>/g, '<em style="color: #000000; font-style: italic;">')
    .replace(
      /<h3>/g,
      '<h3 style="color: #000000; margin: 20px 0 10px 0; font-size: 18px; font-weight: 600;">'
    )
    .replace(
      /<h4>/g,
      '<h4 style="color: #000000; margin: 15px 0 8px 0; font-size: 16px; font-weight: 600;">'
    )
    .replace(
      /<a(.*?)>/g,
      '<a$1 style="color: #3b82f6; text-decoration: underline;">'
    );
};

export const sendWelcomeEmail = async ({
  email,
  name,
  intro,
}: WelcomeEmailData) => {
  // Check if user is unsubscribed
  if (await isUserUnsubscribed(email)) {
    console.log(`Skipping welcome email to unsubscribed user: ${email}`);
    return;
  }

  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c]!)
    );

  const dashboardUrl = process.env.BETTER_AUTH_URL || "https://marketgist.com";
  const unsubscribeUrl = getUnsubscribeUrl(email);

  const htmlTemplate = WELCOME_EMAIL_TEMPLATE.replace("{{name}}", escape(name))
    .replace("{{intro}}", sanitizeRich(intro))
    .replace(/\{\{dashboardUrl\}\}/g, dashboardUrl)
    .replace(/\{\{unsubscribeUrl\}\}/g, unsubscribeUrl);

  const mailOptions = {
    fromName: "Marketgist",
    to: email,
    subject: `Welcome to Marketgist - your stock market toolkit is ready!`,
    text: "Thanks for joining Marketgist",
    html: htmlTemplate,
  };

  await sendEmail(mailOptions);
};

export const sendNewsSummaryEmail = async ({
  email,
  date,
  newsContent,
}: {
  email: string;
  date: string;
  newsContent: string;
  name?: string;
}): Promise<void> => {
  // Check if user is unsubscribed
  if (await isUserUnsubscribed(email)) {
    console.log(`Skipping news summary email to unsubscribed user: ${email}`);
    return;
  }

  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c]!)
    );

  const dashboardUrl = process.env.BETTER_AUTH_URL || "https://marketgist.com";
  const unsubscribeUrl = getUnsubscribeUrl(email);

  const htmlTemplate = NEWS_SUMMARY_EMAIL_TEMPLATE.replace(
    "{{date}}",
    escape(date)
  )
    .replace("{{newsContent}}", sanitizeRich(newsContent))
    .replace(/\{\{dashboardUrl\}\}/g, dashboardUrl)
    .replace(/\{\{unsubscribeUrl\}\}/g, unsubscribeUrl);

  const mailOptions = {
    fromName: "Marketgist News",
    to: email,
    subject: `📈 Market News Summary - ${date}`,
    text: `Today's market news summary from Marketgist. Visit ${dashboardUrl} to view your dashboard.`,
    html: htmlTemplate,
  };

  await sendEmail(mailOptions);
};

// Stock Price Alert Email (Upper Target)
export const sendStockAlertUpperEmail = async ({
  email,
  symbol,
  company,
  currentPrice,
  targetPrice,
  timestamp,
}: {
  email: string;
  symbol: string;
  company: string;
  currentPrice: string;
  targetPrice: string;
  timestamp: string;
}): Promise<void> => {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c]!)
    );

  const dashboardUrl = process.env.BETTER_AUTH_URL || "https://marketgist.com";
  const unsubscribeUrl = `${dashboardUrl}/unsubscribe`;

  const htmlTemplate = STOCK_ALERT_UPPER_EMAIL_TEMPLATE.replace(
    /\{\{symbol\}\}/g,
    escape(symbol)
  )
    .replace(/\{\{company\}\}/g, escape(company))
    .replace(/\{\{currentPrice\}\}/g, escape(currentPrice))
    .replace(/\{\{targetPrice\}\}/g, escape(targetPrice))
    .replace(/\{\{timestamp\}\}/g, escape(timestamp))
    .replace(/\{\{dashboardUrl\}\}/g, dashboardUrl)
    .replace(/\{\{unsubscribeUrl\}\}/g, unsubscribeUrl);

  const mailOptions = {
    fromName: "Marketgist Alerts",
    to: email,
    subject: `📈 Price Alert: ${symbol.replace(
      /[\r\n]/g,
      " "
    )} Hit Upper Target - $${currentPrice}`,
    text: `Price Alert: ${symbol} (${company}) hit your upper target of $${targetPrice}. Current price: $${currentPrice}. Visit ${dashboardUrl} to view your dashboard.`,
    html: htmlTemplate,
  };

  await sendEmail(mailOptions);
};

// Stock Price Alert Email (Lower Target)
export const sendStockAlertLowerEmail = async ({
  email,
  symbol,
  company,
  currentPrice,
  targetPrice,
  timestamp,
}: {
  email: string;
  symbol: string;
  company: string;
  currentPrice: string;
  targetPrice: string;
  timestamp: string;
}): Promise<void> => {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c]!)
    );

  const dashboardUrl = process.env.BETTER_AUTH_URL || "https://marketgist.com";
  const unsubscribeUrl = `${dashboardUrl}/unsubscribe`;

  const htmlTemplate = STOCK_ALERT_LOWER_EMAIL_TEMPLATE.replace(
    /\{\{symbol\}\}/g,
    escape(symbol)
  )
    .replace(/\{\{company\}\}/g, escape(company))
    .replace(/\{\{currentPrice\}\}/g, escape(currentPrice))
    .replace(/\{\{targetPrice\}\}/g, escape(targetPrice))
    .replace(/\{\{timestamp\}\}/g, escape(timestamp))
    .replace(/\{\{dashboardUrl\}\}/g, dashboardUrl)
    .replace(/\{\{unsubscribeUrl\}\}/g, unsubscribeUrl);

  const mailOptions = {
    fromName: "Marketgist Alerts",
    to: email,
    subject: `📉 Price Alert: ${symbol.replace(
      /[\r\n]/g,
      " "
    )} Hit Lower Target - $${currentPrice}`,
    text: `Price Alert: ${symbol} (${company}) hit your lower target of $${targetPrice}. Current price: $${currentPrice}. Visit ${dashboardUrl} to view your dashboard.`,
    html: htmlTemplate,
  };

  await sendEmail(mailOptions);
};

// Volume Alert Email
export const sendVolumeAlertEmail = async ({
  email,
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
}: {
  email: string;
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
}): Promise<void> => {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c]!)
    );

  const dashboardUrl = process.env.BETTER_AUTH_URL || "https://marketgist.com";
  const unsubscribeUrl = `${dashboardUrl}/unsubscribe`;
  const priceColor = changeDirection === "+" ? "#10b981" : "#ef4444";

  const htmlTemplate = VOLUME_ALERT_EMAIL_TEMPLATE.replace(
    "{{symbol}}",
    escape(symbol)
  )
    .replace("{{company}}", escape(company))
    .replace("{{currentVolume}}", escape(currentVolume))
    .replace("{{averageVolume}}", escape(averageVolume))
    .replace("{{currentPrice}}", escape(currentPrice))
    .replace("{{changePercent}}", escape(changePercent))
    .replace("{{changeDirection}}", escape(changeDirection))
    .replace("{{volumeSpike}}", escape(volumeSpike))
    .replace("{{alertMessage}}", escape(alertMessage))
    .replace("{{timestamp}}", escape(timestamp))
    .replace("{{priceColor}}", priceColor)
    .replace(/\{\{dashboardUrl\}\}/g, dashboardUrl)
    .replace(/\{\{unsubscribeUrl\}\}/g, unsubscribeUrl);

  const mailOptions = {
    fromName: "Marketgist Alerts",
    to: email,
    subject: `📊 Volume Alert: ${symbol} - ${volumeSpike} Above Normal`,
    text: `Volume Alert: ${symbol} (${company}) has ${volumeSpike} above normal trading activity. Current volume: ${currentVolume}M. Visit ${dashboardUrl} to view your dashboard.`,
    html: htmlTemplate,
  };

  await sendEmail(mailOptions);
};

// Inactive User Reminder Email
export const sendInactiveUserReminderEmail = async ({
  email,
  name,
}: {
  email: string;
  name: string;
}): Promise<void> => {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c]!)
    );

  const dashboardUrl = process.env.BETTER_AUTH_URL || "https://marketgist.com";
  const unsubscribeUrl = `${dashboardUrl}/unsubscribe`;

  const htmlTemplate = INACTIVE_USER_REMINDER_EMAIL_TEMPLATE.replace(
    "{{name}}",
    escape(name)
  )
    .replace(/\{\{dashboardUrl\}\}/g, dashboardUrl)
    .replace(/\{\{unsubscribeUrl\}\}/g, unsubscribeUrl);

  const mailOptions = {
    fromName: "Marketgist",
    to: email,
    subject: `We Miss You! Your Market Insights Await`,
    text: `We noticed you haven't visited Marketgist in a while. The markets have been moving, and there might be some opportunities you don't want to miss! Visit ${dashboardUrl} to return to your dashboard.`,
    html: htmlTemplate,
  };

  await sendEmail(mailOptions);
};
