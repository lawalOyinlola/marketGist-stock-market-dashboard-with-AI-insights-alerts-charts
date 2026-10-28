import { apiRateLimiter } from "@/lib/utils/rateLimiter";

// Not a "use server" module on purpose: every export of a "use server" file is
// a candidate public endpoint, and this function takes a URL.
const FINNHUB_ORIGIN = "https://finnhub.io";

export async function fetchJSON<T>(
  url: string,
  revalidateSeconds?: number,
  retries: number = 3
): Promise<T> {
  // Only ever talk to Finnhub, whatever the caller passes in.
  if (new URL(url).origin !== FINNHUB_ORIGIN) {
    throw new Error("Blocked request to a host that is not Finnhub");
  }

  const options: RequestInit & { next?: { revalidate?: number } } =
    revalidateSeconds
      ? {
          cache: "force-cache",
          next: { revalidate: revalidateSeconds },
          redirect: "error",
        }
      : { cache: "no-store", redirect: "error" };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Check rate limit before making request
      if (!apiRateLimiter.isAllowed("finnhub-api")) {
        const waitTime = apiRateLimiter.getTimeUntilReset("finnhub-api");
        console.log(
          `Rate limit exceeded. Waiting ${Math.ceil(
            waitTime / 1000
          )} seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); // 10s

      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        if (!res.ok) {
          const text = await res.text().catch(() => "");

          // Handle specific error cases
          if (res.status === 403) {
            console.error(
              "Finnhub API 403 Error - Possible rate limit or quota exceeded"
            );
            if (attempt < retries) {
              console.log(
                `Retrying in ${
                  attempt * 2
                } seconds... (attempt ${attempt}/${retries})`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, attempt * 2000)
              );
              continue;
            }
            throw new Error(
              "API rate limit or quota exceeded. Please try again later."
            );
          }

          if (res.status === 429) {
            console.error("Finnhub API 429 Error - Rate limit exceeded");
            if (attempt < retries) {
              console.log(
                `Retrying in ${
                  attempt * 2
                } seconds... (attempt ${attempt}/${retries})`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, attempt * 2000)
              );
              continue;
            }
            throw new Error("API rate limit exceeded. Please try again later.");
          }

          if (res.status === 401) {
            console.error("Finnhub API 401 Error - Invalid API key");
            throw new Error(
              "API authentication failed. Please check your API key."
            );
          }

          throw new Error(`Fetch failed ${res.status}: ${text}`);
        }
        return (await res.json()) as T;
      } catch (error) {
        console.error("Error fetching JSON:", error);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.log(`Fetch attempt ${attempt} failed, retrying...`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error("All retry attempts failed");
}
