import { inngest } from "@/lib/inngest/client";
import {
  NEWS_SUMMARY_EMAIL_PROMPT,
  PERSONALIZED_WELCOME_EMAIL_PROMPT,
} from "@/lib/inngest/prompts";
import {
  sendNewsSummaryEmail,
  sendWelcomeEmail,
  sendStockAlertUpperEmail,
  sendStockAlertLowerEmail,
  sendVolumeAlertEmail,
  sendInactiveUserReminderEmail,
} from "@/lib/nodemailer";
import {
  getAllUsersForNewsEmail,
  getInactiveUsers,
} from "@/lib/actions/user.actions";
import { getWatchlistSymbolsByEmail } from "@/lib/actions/watchlist.actions";
import { getNews } from "@/lib/actions/finnhub.actions";
import { getFormattedTodayDate } from "@/lib/utils";
import { NEWS_FALLBACK_CONTENT } from "../nodemailer/templates";

export const sendSignUpEmail = inngest.createFunction(
  { id: "sign-up-email", triggers: { event: "app/user.created" } },
  async ({ event, step }) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable is required");
      }

      const { country, investmentGoals, riskTolerance, preferredIndustry } =
        event.data;

      if (
        !country ||
        !investmentGoals ||
        !riskTolerance ||
        !preferredIndustry
      ) {
        console.error("Missing required user profile data", event.data);
        return {
          success: false,
          message: "Missing required user profile data",
        };
      }

      const userProfile = `
        - Country: ${country}
        - Investment goals: ${investmentGoals}
        - Risk tolerance: ${riskTolerance}
        - Preferred industry: ${preferredIndustry}
      `;

      const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace(
        "{{userProfile}}",
        userProfile
      );

      const response = await step.ai.infer("generate-welcome-intro", {
        model: step.ai.models.gemini({ model: "gemini-2.5-flash-lite" }),
        body: {
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        },
      });

      await step.run("send-welcome-email", async () => {
        const part = response.candidates?.[0]?.content?.parts?.[0];
        const introText =
          (part && "text" in part ? part.text : null) ||
          "Thanks for joining Marketgist. You now have the tools to track markets and make smarter moves.";

        const {
          data: { email, name },
        } = event;

        try {
          return await sendWelcomeEmail({ email, name, intro: introText });
        } catch (error) {
          console.error("Failed to send welcome email to:", email, error);
          throw error;
        }
      });

      return {
        success: true,
        message: "Welcome email sent successfully",
      };
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      return {
        success: false,
        message: "Failed to send welcome email",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
);

export const sendDailyNewsSummary = inngest.createFunction(
  {
    id: "daily-news-summary",
    triggers: [{ event: "app/send.daily.news" }, { cron: "0 12 * * *" }],
  },
  async ({ step }) => {
    // Step #1: Get all users for news delivery
    const users = await step.run("get-all-users", getAllUsersForNewsEmail);

    if (!users || users.length === 0)
      return { success: false, message: "No users found for news email" };

    // Step #2: For each user, get watchlist symbols -> fetch news (fallback to general)
    const results = await step.run("fetch-user-news", async () => {
      const perUser: Array<{
        user: User;
        articles: MarketNewsArticle[];
      }> = [];
      for (const user of users as User[]) {
        try {
          const symbols = await getWatchlistSymbolsByEmail(user.email);

          let articles: MarketNewsArticle[] = [];

          // If user has watchlist items, try to get news for those symbols
          if (symbols.length > 0) {
            const safeEmail = user.email.replace(/^(.).+(@.+)$/, "$1***$2");
            console.log(
              `Fetching news for ${safeEmail} watchlist: ${symbols.length} symbols`
            );
            articles = await getNews(symbols);
            // Enforce max 6 articles per user
            articles = (articles || []).slice(0, 6);
          }

          // If no articles found (either no watchlist or watchlist news failed), fetch general news
          if (!articles || articles.length === 0) {
            const safeEmail2 = user.email.replace(/^(.).+(@.+)$/, "$1***$2");
            console.log(
              `No watchlist articles found for ${safeEmail2} (watchlist: ${
                symbols.length > 0 ? `${symbols.length} stocks` : "empty"
              }), fetching general market news...`
            );
            articles = await getNews();
            articles = (articles || []).slice(0, 6);
          }

          perUser.push({ user, articles });
        } catch (e) {
          console.error("daily-news: error preparing user news", user.email, e);
          perUser.push({ user, articles: [] });
        }
      }
      return perUser;
    });

    // Step #3: (placeholder) Summarize news via AI
    const userNewsSummaries: {
      user: User;
      newsContent: string | null;
    }[] = [];

    for (const { user, articles } of results) {
      try {
        // If no articles, provide fallback content
        if (!articles || articles.length === 0) {
          console.log(
            `No articles found for ${user.email}, using fallback content`
          );

          userNewsSummaries.push({ user, newsContent: NEWS_FALLBACK_CONTENT });
          continue;
        }

        const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace(
          "{{newsData}}",
          JSON.stringify(articles, null, 2)
        );

        const response = await step.ai.infer(`summarize-news-${user.email}`, {
          model: step.ai.models.gemini({ model: "gemini-2.5-flash-lite" }),
          body: {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        const newsContent =
          (part && "text" in part ? part.text : null) || "No market news.";

        userNewsSummaries.push({ user, newsContent });
      } catch (error) {
        console.error("Failed to summarize news for : ", user.email, error);
        userNewsSummaries.push({ user, newsContent: null });
      }
    }

    // Step #4: (placeholder) Send the emails
    await step.run("send-news-emails", async () => {
      await Promise.all(
        userNewsSummaries.map(async ({ user, newsContent }) => {
          if (!newsContent) return false;

          return await sendNewsSummaryEmail({
            email: user.email,
            date: getFormattedTodayDate(),
            newsContent,
          });
        })
      );
    });

    return {
      success: true,
      message: "Daily news summary emails sent successfully",
    };
  }
);

// Stock Price Alert Functions
export const sendStockAlertUpper = inngest.createFunction(
  { id: "stock-alert-upper", triggers: { event: "app/stock.alert.upper" } },
  async ({ event, step }) => {
    try {
      const { email, symbol, company, currentPrice, targetPrice, timestamp } =
        event.data;

      await step.run("send-upper-alert-email", async () => {
        return await sendStockAlertUpperEmail({
          email,
          symbol,
          company,
          currentPrice: currentPrice.toString(),
          targetPrice: targetPrice.toString(),
          timestamp,
        });
      });

      return {
        success: true,
        message: `Upper price alert sent for ${symbol} to ${email}`,
      };
    } catch (error) {
      console.error("Failed to send upper price alert:", error);
      return {
        success: false,
        message: "Failed to send upper price alert",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
);

export const sendStockAlertLower = inngest.createFunction(
  { id: "stock-alert-lower", triggers: { event: "app/stock.alert.lower" } },
  async ({ event, step }) => {
    try {
      const { email, symbol, company, currentPrice, targetPrice, timestamp } =
        event.data;

      await step.run("send-lower-alert-email", async () => {
        return await sendStockAlertLowerEmail({
          email,
          symbol,
          company,
          currentPrice: currentPrice.toString(),
          targetPrice: targetPrice.toString(),
          timestamp,
        });
      });

      return {
        success: true,
        message: `Lower price alert sent for ${symbol} to ${email}`,
      };
    } catch (error) {
      console.error("Failed to send lower price alert:", error);
      return {
        success: false,
        message: "Failed to send lower price alert",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
);

export const sendVolumeAlert = inngest.createFunction(
  { id: "volume-alert", triggers: { event: "app/volume.alert" } },
  async ({ event, step }) => {
    try {
      const {
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
      } = event.data;

      await step.run("send-volume-alert-email", async () => {
        return await sendVolumeAlertEmail({
          email,
          symbol,
          company,
          currentVolume: currentVolume.toString(),
          averageVolume: averageVolume.toString(),
          currentPrice: currentPrice.toString(),
          changePercent: changePercent.toString(),
          changeDirection,
          volumeSpike,
          alertMessage,
          timestamp,
        });
      });

      return {
        success: true,
        message: `Volume alert sent for ${symbol} to ${email}`,
      };
    } catch (error) {
      console.error("Failed to send volume alert:", error);
      return {
        success: false,
        message: "Failed to send volume alert",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
);

/**
 * Inactive User Reminder - Weekly scheduled job
 *
 * Sends reminder emails to users who haven't logged in for 30+ days.
 * Runs every 7 days (every Sunday at midnight).
 *
 * Conditions for sending:
 * - User hasn't logged in within the last 30 days
 * - Email includes personalized call-to-action to return
 */
export const sendInactiveUserReminder = inngest.createFunction(
  {
    id: "inactive-user-reminder",
    triggers: [{ cron: "0 0 * * 0" }], // Run every 7 days (every Sunday at midnight)
  },
  async ({ step }) => {
    try {
      // Get all inactive users (haven't logged in for 30+ days)
      const inactiveUsers = await step.run(
        "get-inactive-users",
        getInactiveUsers
      );

      if (!inactiveUsers || inactiveUsers.length === 0) {
        console.log("No inactive users found");
        return { success: true, message: "No inactive users found" };
      }

      console.log(
        `Found ${inactiveUsers.length} inactive users to send reminders to`
      );

      // Send reminder email to each inactive user
      await step.run("send-inactive-reminder-emails", async () => {
        const CONCURRENCY = 10;
        for (let i = 0; i < inactiveUsers.length; i += CONCURRENCY) {
          const batch = inactiveUsers.slice(i, i + CONCURRENCY);
          await Promise.all(
            batch.map(async (user) => {
              try {
                await sendInactiveUserReminderEmail({
                  email: user.email,
                  name: user.name,
                });
                return { success: true, email: user.email };
              } catch (error) {
                console.error(
                  `Failed to send reminder to ${user.email}:`,
                  error
                );
                return { success: false, email: user.email };
              }
            })
          );
        }
      });

      return {
        success: true,
        message: `Inactive user reminders sent to ${inactiveUsers.length} users`,
        count: inactiveUsers.length,
      };
    } catch (error) {
      console.error("Failed to send inactive user reminders:", error);
      return {
        success: false,
        message: "Failed to send inactive user reminders",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
);

// Stock Price Alert Monitoring - checks prices and triggers alerts
export const monitorStockAlerts = inngest.createFunction(
  {
    id: "monitor-stock-alerts",
    concurrency: 1, // Prevent race conditions by running one instance at a time
    triggers: [{ cron: "0 * * * *" }], // Every hour on the hour
  },
  async ({ step }) => {
    const { checkAlertsAndTrigger } = await import(
      "@/lib/actions/alert-monitor.actions"
    );

    const result = await step.run("check-alerts-and-trigger", async () => {
      // Add timeout protection at the action level as well
      return await Promise.race([
        checkAlertsAndTrigger(),
        new Promise<Awaited<ReturnType<typeof checkAlertsAndTrigger>>>((resolve) =>
          setTimeout(
            () => resolve({ triggered: [], errors: ["Alert check timed out"] }),
            3 * 60 * 1000
          )
        ),
      ]);
    });

    return {
      success: true,
      message: `Checked alerts: ${result.triggered.length} triggered, ${result.errors.length} errors`,
      triggered: result.triggered.length,
      errors: result.errors.length,
    };
  }
);
