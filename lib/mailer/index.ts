import { Resend } from "resend";
import {
  welcomeEmail,
  newsSummaryEmail,
  priceAlertEmail,
  volumeAlertEmail,
  inactiveReminderEmail,
} from "@/lib/mailer/templates";
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
  headers?: Record<string, string>;
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

const appUrl = () => process.env.BETTER_AUTH_URL || "https://marketgist.com";

// Lets Gmail and Apple Mail show their own unsubscribe button next to the
// sender. Only marketing email gets it; alerts are opt-in per stock.
const unsubscribeHeaders = (unsubscribeUrl: string) => ({
  "List-Unsubscribe": `<${unsubscribeUrl}>`,
});

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

  const unsubscribeUrl = getUnsubscribeUrl(email);

  await sendEmail({
    fromName: "Marketgist",
    to: email,
    ...welcomeEmail({ name, intro, appUrl: appUrl(), unsubscribeUrl }),
    headers: unsubscribeHeaders(unsubscribeUrl),
  });
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

  const unsubscribeUrl = getUnsubscribeUrl(email);

  await sendEmail({
    fromName: "Marketgist News",
    to: email,
    ...newsSummaryEmail({
      date,
      newsContent,
      appUrl: appUrl(),
      unsubscribeUrl,
    }),
    headers: unsubscribeHeaders(unsubscribeUrl),
  });
};

type PriceAlertData = {
  email: string;
  symbol: string;
  company: string;
  currentPrice: string;
  targetPrice: string;
  timestamp: string;
};

// Stock Price Alert Email (Upper Target)
export const sendStockAlertUpperEmail = async ({
  email,
  ...alert
}: PriceAlertData): Promise<void> => {
  await sendEmail({
    fromName: "Marketgist Alerts",
    to: email,
    ...priceAlertEmail({ direction: "upper", ...alert, appUrl: appUrl() }),
  });
};

// Stock Price Alert Email (Lower Target)
export const sendStockAlertLowerEmail = async ({
  email,
  ...alert
}: PriceAlertData): Promise<void> => {
  await sendEmail({
    fromName: "Marketgist Alerts",
    to: email,
    ...priceAlertEmail({ direction: "lower", ...alert, appUrl: appUrl() }),
  });
};

// Volume Alert Email
export const sendVolumeAlertEmail = async ({
  email,
  ...alert
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
  await sendEmail({
    fromName: "Marketgist Alerts",
    to: email,
    ...volumeAlertEmail({ ...alert, appUrl: appUrl() }),
  });
};

// Inactive User Reminder Email
export const sendInactiveUserReminderEmail = async ({
  email,
  name,
}: {
  email: string;
  name: string;
}): Promise<void> => {
  // A reminder is marketing email, so it honours unsubscribe like the brief
  if (await isUserUnsubscribed(email)) {
    console.log(`Skipping inactive reminder to unsubscribed user: ${email}`);
    return;
  }

  const unsubscribeUrl = getUnsubscribeUrl(email);

  await sendEmail({
    fromName: "Marketgist",
    to: email,
    ...inactiveReminderEmail({ name, appUrl: appUrl(), unsubscribeUrl }),
    headers: unsubscribeHeaders(unsubscribeUrl),
  });
};
