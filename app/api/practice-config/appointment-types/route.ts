import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  syncPracticeAppointmentTypes, 
  createNexhealthAppointmentType 
} from "@/lib/nexhealth";

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

    // If practice has NexHealth configuration, sync appointment types
    if (practice.nexhealthSubdomain && practice.nexhealthLocationId) {
      try {
        console.log(`Syncing appointment types for practice ${practice.id}...`);
        await syncPracticeAppointmentTypes(
          practice.id,
          practice.nexhealthSubdomain,
          practice.nexhealthLocationId
        );

        // Refetch appointment types after sync
        const updatedPractice = await prisma.practice.findUnique({
          where: { clerkUserId: userId },
          include: {
            appointmentTypes: {
              orderBy: { name: 'asc' }
            }
          }
        });

        return NextResponse.json({
          success: true,
          appointmentTypes: updatedPractice?.appointmentTypes || []
        });
      } catch (syncError) {
        console.error("Error syncing appointment types:", syncError);
        
        // Return existing appointment types even if sync failed
        return NextResponse.json({
          success: true,
          appointmentTypes: practice.appointmentTypes,
          syncError: syncError instanceof Error ? syncError.message : 'Unknown sync error'
        });
      }
    }

    // Return existing appointment types if no NexHealth config
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

    const { name, minutes, bookableOnline } = await req.json();

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({
        error: "Name is required and must be a non-empty string"
      }, { status: 400 });
    }

    if (!minutes || typeof minutes !== 'number' || minutes <= 0) {
      return NextResponse.json({
        error: "Minutes is required and must be a positive number"
      }, { status: 400 });
    }

    try {
      // Create appointment type in NexHealth
      const nexhealthResponse = await createNexhealthAppointmentType(
        practice.nexhealthSubdomain,
        practice.nexhealthLocationId,
        {
          name: name.trim(),
          minutes,
          bookable_online: bookableOnline ?? true,
          parent_type: "Location",
          parent_id: practice.nexhealthLocationId
        }
      );

      // Create appointment type in local database
      const localAppointmentType = await prisma.appointmentType.create({
        data: {
          practiceId: practice.id,
          nexhealthAppointmentTypeId: nexhealthResponse.id.toString(),
          name: nexhealthResponse.name,
          duration: nexhealthResponse.minutes,
          bookableOnline: nexhealthResponse.bookable_online,
          parentType: nexhealthResponse.parent_type,
          parentId: nexhealthResponse.parent_id.toString()
        }
      });

      return NextResponse.json({
        success: true,
        appointmentType: localAppointmentType
      });

    } catch (nexhealthError) {
      console.error("Error creating appointment type in NexHealth:", nexhealthError);
      return NextResponse.json({
        error: nexhealthError instanceof Error ? nexhealthError.message : 'Failed to create appointment type in NexHealth'
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Error creating appointment type:", error);
    return NextResponse.json(
      { error: "Failed to create appointment type" },
      { status: 500 }
    );
  }
} 