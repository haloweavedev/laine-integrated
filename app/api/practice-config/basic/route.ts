import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const name = formData.get("practiceName") as string | null;
    const subdomain = formData.get("nexhealthSubdomain") as string;
    const locationId = formData.get("nexhealthLocationId") as string;

    if (!subdomain || !locationId) {
      return NextResponse.json(
        { error: "Subdomain and Location ID are required" },
        { status: 400 }
      );
    }

    await prisma.practice.upsert({
      where: { clerkUserId: userId },
      update: { name, nexhealthSubdomain: subdomain, nexhealthLocationId: locationId },
      create: { clerkUserId: userId, name, nexhealthSubdomain: subdomain, nexhealthLocationId: locationId },
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error saving practice config:", error);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
} 