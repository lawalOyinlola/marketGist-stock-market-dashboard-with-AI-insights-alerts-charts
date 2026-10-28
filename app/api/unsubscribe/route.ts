import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import { EmailPreference } from "@/database/models/emailPreference.model";
import { verifyUnsubscribeToken } from "@/lib/utils/email";
import { limitByIp } from "@/lib/utils/rate-limit";

const bodySchema = z.object({
  email: z.email().max(254),
  token: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const limited = await limitByIp("unsubscribe", 20, 15 * 60);
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid unsubscribe link" },
        { status: 400 }
      );
    }
    const { email, token } = parsed.data;

    if (!verifyUnsubscribeToken(email, token)) {
      return NextResponse.json(
        { error: "Invalid unsubscribe link" },
        { status: 403 }
      );
    }

    await connectToDatabase();

    // Update or create the unsubscribe preference
    await EmailPreference.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        email: email.toLowerCase(),
        unsubscribed: true,
        unsubscribedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      message: "Successfully unsubscribed from email notifications",
    });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Failed to process unsubscription" },
      { status: 500 }
    );
  }
}
