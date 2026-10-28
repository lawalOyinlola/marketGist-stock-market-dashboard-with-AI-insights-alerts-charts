// Simple logging utility for production
const isDevelopment = process.env.NODE_ENV === "development";

// Strip line breaks and control characters so user input cannot forge log lines.
export const sanitizeLog = (value: unknown): string =>
  String(value).replace(/[\x00-\x1F\x7F\u2028\u2029]/g, " ");

// Sanitize non-Error log args at sink time to prevent log injection.
const sanitizeLogArgs = (args: unknown[]): unknown[] =>
  args.map((arg) => (arg instanceof Error ? arg : sanitizeLog(arg)));

// Log "j***@example.com" instead of a full address
export const maskEmail = (email: unknown): string =>
  sanitizeLog(email).replace(/^(.).*(@.+)$/, "$1***$2");

export const logger = {
  // Always log errors
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...sanitizeLogArgs(args));
  },

  // Log warnings (always)
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...sanitizeLogArgs(args));
  },

  // Info logs (development only)
  info: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.info(`[INFO] ${message}`, ...sanitizeLogArgs(args));
    }
  },

  // Debug logs (development only)
  debug: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, ...sanitizeLogArgs(args));
    }
  },

  // Success logs (always)
  success: (message: string, ...args: unknown[]) => {
    console.log(`[SUCCESS] ${message}`, ...sanitizeLogArgs(args));
  },
};
