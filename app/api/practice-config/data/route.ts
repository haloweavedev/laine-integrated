import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({ 
      where: { clerkUserId: userId },
      include: {
        appointmentTypes: true,
        providers: true,
        savedProviders: {
          include: {
            provider: true
          },
          where: { isActive: true }
        },
        savedOperatories: {
          where: { isActive: true }
        },
        nexhealthWebhookSubscriptions: {
          where: { isActive: true },
          orderBy: [
            { resourceType: 'asc' },
            { eventName: 'asc' }
          ]
        }
      }
    });

    // Check if global webhook endpoint is configured
    const globalWebhookEndpoint = await prisma.globalNexhealthWebhookEndpoint.findUnique({
      where: { id: "singleton" }
    });

    return NextResponse.json({
      practice,
      globalWebhookEndpoint
    });

  } catch (error) {
    console.error("Error fetching practice data:", error);
    return NextResponse.json(
      { error: "Failed to fetch practice data" },
      { status: 500 }
    );
  }
} 