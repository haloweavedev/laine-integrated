import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateNexhealthAvailability, deleteNexhealthAvailability } from "@/lib/nexhealth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ availabilityId: string }> }) {
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

    const { availabilityId } = await params;

    // Find the existing availability
    const existingAvailability = await prisma.manualAvailability.findFirst({
      where: {
        id: availabilityId,
        practiceId: practice.id
      },
      include: {
        provider: true,
        savedOperatory: true
      }
    });

    if (!existingAvailability) {
      return NextResponse.json({ error: "Availability not found" }, { status: 404 });
    }

    const {
      providerId,
      operatoryId,
      daysOfWeek,
      beginTime,
      endTime,
      appointmentTypeIds,
      isActive
    } = await req.json();

    // Validate input formats if provided
    if (daysOfWeek && (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0)) {
      return NextResponse.json({ error: "daysOfWeek must be a non-empty array" }, { status: 400 });
    }

    if (appointmentTypeIds && (!Array.isArray(appointmentTypeIds) || appointmentTypeIds.length === 0)) {
      return NextResponse.json({ error: "appointmentTypeIds must be a non-empty array" }, { status: 400 });
    }

    // Validate time format if provided
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (beginTime && !timeRegex.test(beginTime)) {
      return NextResponse.json({ error: "Begin time format must be HH:MM" }, { status: 400 });
    }

    if (endTime && !timeRegex.test(endTime)) {
      return NextResponse.json({ error: "End time format must be HH:MM" }, { status: 400 });
    }

    // Validate end time is after begin time if both are provided
    if (beginTime && endTime) {
      const [beginHour, beginMin] = beginTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const beginMinutes = beginHour * 60 + beginMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= beginMinutes) {
        return NextResponse.json({ error: "End time must be after begin time" }, { status: 400 });
      }
    }

    // Validate provider if provided
    if (providerId) {
      const provider = await prisma.provider.findFirst({
        where: {
          id: providerId,
          practiceId: practice.id
        }
      });

      if (!provider) {
        return NextResponse.json({ error: "Provider not found or doesn't belong to practice" }, { status: 400 });
      }
    }

    // Validate operatory if provided
    let validatedOperatoryId = operatoryId;
    if (operatoryId !== undefined) {
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
      } else {
        validatedOperatoryId = null;
      }
    }

    // Validate appointment types if provided
    if (appointmentTypeIds) {
      const validAppointmentTypes = await prisma.appointmentType.findMany({
        where: {
          practiceId: practice.id,
          nexhealthAppointmentTypeId: { in: appointmentTypeIds }
        }
      });

      if (validAppointmentTypes.length !== appointmentTypeIds.length) {
        return NextResponse.json({ error: "Some appointment types don't belong to practice" }, { status: 400 });
      }
    }

    // Prepare update data (only include fields that were provided)
    const updateData: Record<string, string | string[] | boolean | null> = {};
    if (providerId !== undefined) updateData.providerId = providerId;
    if (validatedOperatoryId !== undefined) updateData.operatoryId = validatedOperatoryId;
    if (daysOfWeek !== undefined) updateData.daysOfWeek = daysOfWeek;
    if (beginTime !== undefined) updateData.beginTime = beginTime;
    if (endTime !== undefined) updateData.endTime = endTime;
    if (appointmentTypeIds !== undefined) updateData.appointmentTypeIds = appointmentTypeIds;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Update the availability
    const updatedAvailability = await prisma.manualAvailability.update({
      where: { id: availabilityId },
      data: updateData,
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

    // Update availability in NexHealth
    if (existingAvailability.nexhealthAvailabilityId) {
      try {
        await updateNexhealthAvailability(
          practice.nexhealthSubdomain!,
          existingAvailability.nexhealthAvailabilityId,
          {
            provider_id: Number(updatedAvailability.provider.nexhealthProviderId),
            operatory_id: updatedAvailability.savedOperatory?.nexhealthOperatoryId ? Number(updatedAvailability.savedOperatory.nexhealthOperatoryId) : undefined,
            days: updatedAvailability.daysOfWeek,
            begin_time: updatedAvailability.beginTime,
            end_time: updatedAvailability.endTime,
            appointment_type_ids: updatedAvailability.appointmentTypeIds.map(Number),
            active: updatedAvailability.isActive
          }
        );

        await prisma.manualAvailability.update({
          where: { id: availabilityId },
          data: {
            lastSyncWithNexhealthAt: new Date(),
            syncError: null
          }
        });
      } catch (error) {
        console.error("Failed to update availability in NexHealth:", error);
        await prisma.manualAvailability.update({
          where: { id: availabilityId },
          data: {
            syncError: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      availability: updatedAvailability 
    });

  } catch (error) {
    console.error("Error updating availability:", error);
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ availabilityId: string }> }) {
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

    const { availabilityId } = await params;

    // Find the existing availability
    const existingAvailability = await prisma.manualAvailability.findFirst({
      where: {
        id: availabilityId,
        practiceId: practice.id
      }
    });

    if (!existingAvailability) {
      return NextResponse.json({ error: "Availability not found" }, { status: 404 });
    }

    // Delete availability from NexHealth first
    if (existingAvailability.nexhealthAvailabilityId) {
      try {
        await deleteNexhealthAvailability(
          practice.nexhealthSubdomain!,
          existingAvailability.nexhealthAvailabilityId
        );
      } catch (error) {
        console.error("Failed to delete availability from NexHealth:", error);
        // Continue with local deletion even if NexHealth deletion fails
      }
    }

    // Delete from local database
    await prisma.manualAvailability.delete({
      where: { id: availabilityId }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error deleting availability:", error);
    return NextResponse.json(
      { error: "Failed to delete availability" },
      { status: 500 }
    );
  }
} 