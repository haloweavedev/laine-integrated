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
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Execute all queries in parallel for better performance
    const [appointmentsBookedByLaine, activeProvidersCount, appointmentTypesCount] = await Promise.all([
      // Count appointments booked via Laine
      prisma.callLog.count({
        where: {
          practiceId: practice.id,
          bookedAppointmentNexhealthId: {
            not: null
          }
        }
      }),

      // Count active providers
      prisma.savedProvider.count({
        where: {
          practiceId: practice.id,
          isActive: true
        }
      }),

      // Count appointment types created
      prisma.appointmentType.count({
        where: {
          practiceId: practice.id
        }
      })
    ]);

    return NextResponse.json({
      appointmentsBookedByLaine,
      activeProvidersCount,
      appointmentTypesCount
    });

  } catch (error) {
    console.error("Error fetching quick review data:", error);
    return NextResponse.json(
      { error: "Failed to fetch quick review data" },
      { status: 500 }
    );
  }
} 