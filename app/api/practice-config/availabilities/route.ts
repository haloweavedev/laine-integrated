import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNexhealthAvailability } from "@/lib/nexhealth";

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

    const availabilities = await prisma.manualAvailability.findMany({
      where: { practiceId: practice.id },
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nexhealthProviderId: true
          }
        },
        savedOperatory: {
          select: {
            id: true,
            name: true,
            nexhealthOperatoryId: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Map appointment type IDs to their names for easier display
    const appointmentTypes = await prisma.appointmentType.findMany({
      where: { practiceId: practice.id },
      select: {
        nexhealthAppointmentTypeId: true,
        name: true
      }
    });

    const appointmentTypeMap = new Map(
      appointmentTypes.map(type => [type.nexhealthAppointmentTypeId, type.name])
    );

    const availabilitiesWithTypeNames = availabilities.map(availability => ({
      ...availability,
      appointmentTypeNames: availability.appointmentTypeIds.map(typeId => 
        appointmentTypeMap.get(typeId) || `Unknown Type (${typeId})`
      )
    }));

    return NextResponse.json({ availabilities: availabilitiesWithTypeNames });

  } catch (error) {
    console.error("Error fetching availabilities:", error);
    return NextResponse.json(
      { error: "Failed to fetch availabilities" },
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
      where: { clerkUserId: userId },
      include: {
        savedOperatories: true
      }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    const {
      providerId,
      operatoryId,
      daysOfWeek,
      beginTime,
      endTime,
      appointmentTypeIds,
      isActive = true
    } = await req.json();

    // Validate required fields
    if (!providerId || !daysOfWeek || !beginTime || !endTime || !appointmentTypeIds) {
      return NextResponse.json({ 
        error: "Missing required fields: providerId, daysOfWeek, beginTime, endTime, appointmentTypeIds" 
      }, { status: 400 });
    }

    // Validate input formats
    if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
      return NextResponse.json({ error: "daysOfWeek must be a non-empty array" }, { status: 400 });
    }

    if (!Array.isArray(appointmentTypeIds) || appointmentTypeIds.length === 0) {
      return NextResponse.json({ error: "appointmentTypeIds must be a non-empty array" }, { status: 400 });
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(beginTime) || !timeRegex.test(endTime)) {
      return NextResponse.json({ error: "Time format must be HH:MM" }, { status: 400 });
    }

    // Validate end time is after begin time
    const [beginHour, beginMin] = beginTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const beginMinutes = beginHour * 60 + beginMin;
    const endMinutes = endHour * 60 + endMin;

    if (endMinutes <= beginMinutes) {
      return NextResponse.json({ error: "End time must be after begin time" }, { status: 400 });
    }

    // Validate provider exists and belongs to practice
    const provider = await prisma.provider.findFirst({
      where: {
        id: providerId,
        practiceId: practice.id
      }
    });

    if (!provider) {
      return NextResponse.json({ error: "Provider not found or doesn't belong to practice" }, { status: 400 });
    }

    // Validate operatory if provided
    let validatedOperatoryId = null;
    if (operatoryId) {
      const operatory = await prisma.savedOperatory.findFirst({
        where: {
          id: operatoryId,
          practiceId: practice.id,
          isActive: true
        }
      });

      if (!operatory) {
        return NextResponse.json({ error: "Operatory not found or not active" }, { status: 400 });
      }
      validatedOperatoryId = operatoryId;
    }

    // Validate appointment types belong to practice
    const validAppointmentTypes = await prisma.appointmentType.findMany({
      where: {
        practiceId: practice.id,
        nexhealthAppointmentTypeId: { in: appointmentTypeIds }
      }
    });

    if (validAppointmentTypes.length !== appointmentTypeIds.length) {
      return NextResponse.json({ error: "Some appointment types don't belong to practice" }, { status: 400 });
    }

    // Create the manual availability
    const availability = await prisma.manualAvailability.create({
      data: {
        practiceId: practice.id,
        providerId,
        operatoryId: validatedOperatoryId,
        daysOfWeek,
        beginTime,
        endTime,
        appointmentTypeIds,
        isActive
      },
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nexhealthProviderId: true
          }
        },
        savedOperatory: {
          select: {
            id: true,
            name: true,
            nexhealthOperatoryId: true
          }
        }
      }
    });

    // Create availability in NexHealth
    try {
      const nexhealthAvailability = await createNexhealthAvailability(
        practice.nexhealthSubdomain!,
        practice.nexhealthLocationId!,
        {
          provider_id: Number(provider.nexhealthProviderId),
          operatory_id: availability.savedOperatory?.nexhealthOperatoryId ? Number(availability.savedOperatory.nexhealthOperatoryId) : undefined,
          days: daysOfWeek,
          begin_time: beginTime,
          end_time: endTime,
          appointment_type_ids: appointmentTypeIds.map(Number),
          active: isActive
        }
      );

      // Update with NexHealth ID
      await prisma.manualAvailability.update({
        where: { id: availability.id },
        data: {
          nexhealthAvailabilityId: nexhealthAvailability.id.toString(),
          lastSyncWithNexhealthAt: new Date(),
          syncError: null
        }
      });
    } catch (error) {
      console.error("Failed to create availability in NexHealth:", error);
      await prisma.manualAvailability.update({
        where: { id: availability.id },
        data: {
          syncError: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      availability 
    });

  } catch (error) {
    console.error("Error creating availability:", error);
    return NextResponse.json(
      { error: "Failed to create availability" },
      { status: 500 }
    );
  }
} 