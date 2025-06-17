import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNexhealthAppointmentType } from "@/lib/nexhealth";
import { z } from "zod";

const createAppointmentTypeSchema = z.object({
  name: z.string()
    .min(1, "Name is required and must be a non-empty string")
    .max(100, "Name must be 100 characters or less")
    .trim(),
  minutes: z.number()
    .int("Minutes must be a whole number")
    .min(5, "Duration must be at least 5 minutes")
    .max(480, "Duration must be 8 hours or less"),
  bookableOnline: z.boolean().optional().default(true),
  groupCode: z.string().nullable().optional(),
  keywords: z.string().nullable().optional()
});

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
          orderBy: { name: 'asc' }
        }
      }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Simply return existing appointment types without automatic sync
    return NextResponse.json({
      success: true,
      appointmentTypes: practice.appointmentTypes
    });

  } catch (error) {
    console.error("Error fetching appointment types:", error);
    return NextResponse.json(
      { error: "Failed to fetch appointment types" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json({
        error: "NexHealth configuration is required to create appointment types"
      }, { status: 400 });
    }

    const body = await req.json();

    // Validate input using Zod
    const validationResult = createAppointmentTypeSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({
        error: "Invalid input",
        details: validationResult.error.issues
      }, { status: 400 });
    }

    const { name, minutes, bookableOnline, groupCode, keywords } = validationResult.data;

    try {
      // Create appointment type in NexHealth (groupCode and keywords are Laine-specific, not sent to NexHealth)
      const nexhealthResponse = await createNexhealthAppointmentType(
        practice.nexhealthSubdomain,
        practice.nexhealthLocationId,
        {
          name: name.trim(),
          minutes,
          bookable_online: bookableOnline,
          parent_type: "Location",
          parent_id: practice.nexhealthLocationId
        }
      );

      // Create appointment type in local database with all data from NexHealth response plus Laine-specific fields
      const localAppointmentType = await prisma.appointmentType.create({
        data: {
          practiceId: practice.id,
          nexhealthAppointmentTypeId: nexhealthResponse.id.toString(),
          name: nexhealthResponse.name,
          duration: nexhealthResponse.minutes,
          bookableOnline: nexhealthResponse.bookable_online,
          groupCode: groupCode || null, // Store the Laine-specific group code
          keywords: keywords || null, // Store the Laine-specific keywords
          parentType: nexhealthResponse.parent_type,
          parentId: nexhealthResponse.parent_id.toString(),
          lastSyncError: null // Start with no sync errors
        }
      });

      console.log(`Successfully created appointment type: ${localAppointmentType.name} (Local ID: ${localAppointmentType.id}, NexHealth ID: ${nexhealthResponse.id})`);

      return NextResponse.json({
        success: true,
        appointmentType: localAppointmentType
      });

    } catch (nexhealthError) {
      console.error("Error creating appointment type in NexHealth:", nexhealthError);
      
      // Extract meaningful error message
      const errorMessage = nexhealthError instanceof Error 
        ? nexhealthError.message 
        : 'Failed to create appointment type in NexHealth';
      
      return NextResponse.json({
        error: `NexHealth API Error: ${errorMessage}`
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Error creating appointment type:", error);
    return NextResponse.json(
      { error: "Internal server error while creating appointment type" },
      { status: 500 }
    );
  }
} 