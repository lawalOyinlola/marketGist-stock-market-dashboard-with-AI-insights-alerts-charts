import { NextRequest, NextResponse } from "next/server";
import { limitByIp } from "@/lib/utils/rate-limit";
import { fetchJSON } from "@/lib/utils/finnhub-fetch";
import { FINNHUB_BASE_URL } from "@/lib/constants";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

export async function GET(request: NextRequest) {
  try {
    // Every call spends Finnhub quota, so cap each IP
    const limited = await limitByIp("stocks", 120, 60);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    if (!symbol || !/^[A-Za-z0-9.:\-]{1,20}$/.test(symbol)) {
      return NextResponse.json(
        { error: "A valid symbol parameter is required" },
        { status: 400 }
      );
    }

    if (!FINNHUB_API_KEY) {
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(
      symbol
    )}&token=${FINNHUB_API_KEY}`;

    // Cache for 1 hour (3600 seconds)
    const profile = await fetchJSON<Record<string, unknown>>(url, 3600);

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Error fetching stock profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock profile" },
      { status: 500 }
    );
  }
}
