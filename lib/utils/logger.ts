// Simple logging utility for production
const isDevelopment = process.env.NODE_ENV === "development";

// Strip line breaks and other control characters so user input cannot
// forge log lines. The first pass already covers CR and LF. The last pass
// repeats them in the form CodeQL recognises as a log-injection sanitizer
// (it only accepts newlines replaced with ""), and it must stay last.
export const sanitizeLog = (value: unknown): string =>
  String(value)
    .replace(/[\p{Cc}\u2028\u2029]/gu, " ")
    .replace(/\n|\r/g, "");

// Log "j***@example.com" instead of a full address
export const maskEmail = (email: unknown): string =>
  sanitizeLog(email).replace(/^(.).*(@.+)$/, "$1***$2");

export const logger = {
  // Always log errors
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },

  // Log warnings (always)
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },

  // Info logs (development only)
  info: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.info(`[INFO] ${message}`, ...args);
    }
  },

  // Debug logs (development only)
  debug: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  },

  // Success logs (always)
  success: (message: string, ...args: unknown[]) => {
    console.log(`[SUCCESS] ${message}`, ...args);
  },
};
