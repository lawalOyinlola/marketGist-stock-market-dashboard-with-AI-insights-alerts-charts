import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "market-gist",
  // v4 turns checkpointing on, which runs several steps in one serverless
  // invocation. The alert monitor and the email loops can run for minutes, so
  // keep the v3 behaviour of one HTTP request per step.
  checkpointing: false,
  ai: {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
    },
  },
});
