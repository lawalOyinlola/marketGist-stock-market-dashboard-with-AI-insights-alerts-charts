import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";
import { Notification } from "@/database/models/notification.model";
import { getAuth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectToDatabase();

    // Get current user
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const isRead = searchParams.get("isRead");
    const limitParam = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Math.min(Math.max(limitParam, 1), 100); // Clamp between 1 and 100
    const since = searchParams.get("since"); // ISO timestamp to get notifications after this time

    // Build query
    const query: {
      userId: string;
      isRead?: boolean;
      createdAt?: { $gt: Date };
    } = { userId };
    if (isRead !== null && isRead !== undefined) {
      query.isRead = isRead === "true";
    }
    if (since) {
      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid 'since' timestamp" },
          { status: 400 }
        );
      }
      query.createdAt = { $gt: sinceDate };
    }

    // Fetch notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Get count of unread notifications
    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// Mark notification as read
export async function PATCH(request: NextRequest) {
  try {
    // Connect to database
    await connectToDatabase();

    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    let notificationId, markAllAsRead;
    try {
      ({ notificationId, markAllAsRead } = await request.json());
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    if (markAllAsRead) {
      // Mark all notifications as read for this user
      await Notification.updateMany(
        { userId, isRead: false },
        { $set: { isRead: true } }
      );
      return NextResponse.json({ success: true });
    }

    if (notificationId) {
      // Mark specific notification as read
      const result = await Notification.updateOne(
        { _id: notificationId, userId },
        { $set: { isRead: true } }
      );
      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: "Notification not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Missing notificationId or markAllAsRead" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating notification:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }
}
