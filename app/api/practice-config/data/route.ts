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
        appointmentTypes: {
          select: {
            id: true,
            nexhealthAppointmentTypeId: true,
            name: true,
            duration: true,
            bookableOnline: true,
            groupCode: true,
            keywords: true,
            createdAt: true,
            updatedAt: true
          }
        },
        providers: {
          select: {
            id: true,
            nexhealthProviderId: true,
            firstName: true,
            lastName: true
          }
        },
        savedProviders: {
          select: {
            id: true,
            providerId: true,
            isActive: true,
            provider: {
              select: {
                id: true,
                nexhealthProviderId: true,
                firstName: true,
                lastName: true
              }
            }
          },
          where: { isActive: true }
        },
        savedOperatories: {
          select: {
            id: true,
            nexhealthOperatoryId: true,
            name: true,
            isActive: true
          },
          where: { isActive: true }
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