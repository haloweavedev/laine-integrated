import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  updateNexhealthAppointmentType, 
  deleteNexhealthAppointmentType 
} from "@/lib/nexhealth";

interface RouteParams {
  appointmentTypeId: string;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { appointmentTypeId } = await params;

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json({
        error: "NexHealth configuration is required to update appointment types"
      }, { status: 400 });
    }

    // Fetch the local appointment type record to get the NexHealth ID
    const localAppointmentType = await prisma.appointmentType.findFirst({
      where: {
        id: appointmentTypeId,
        practiceId: practice.id
      }
    });

    if (!localAppointmentType) {
      return NextResponse.json({
        error: "Appointment type not found"
      }, { status: 404 });
    }

    const { name, minutes, bookableOnline } = await req.json();

    // Build update data object with only provided fields
    const updateData: {
      name?: string;
      minutes?: number;
      bookable_online?: boolean;
    } = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({
          error: "Name must be a non-empty string"
        }, { status: 400 });
      }
      updateData.name = name.trim();
    }

    if (minutes !== undefined) {
      if (typeof minutes !== 'number' || minutes <= 0) {
        return NextResponse.json({
          error: "Minutes must be a positive number"
        }, { status: 400 });
      }
      updateData.minutes = minutes;
    }

    if (bookableOnline !== undefined) {
      updateData.bookable_online = bookableOnline;
    }

    try {
      // Update appointment type in NexHealth
      const nexhealthResponse = await updateNexhealthAppointmentType(
        practice.nexhealthSubdomain,
        localAppointmentType.nexhealthAppointmentTypeId,
        practice.nexhealthLocationId,
        updateData
      );

      // Update appointment type in local database
      const updatedLocalAppointmentType = await prisma.appointmentType.update({
        where: { id: appointmentTypeId },
        data: {
          name: nexhealthResponse.name,
          duration: nexhealthResponse.minutes,
          bookableOnline: nexhealthResponse.bookable_online,
          parentType: nexhealthResponse.parent_type,
          parentId: nexhealthResponse.parent_id.toString(),
          lastSyncError: null // Clear any previous errors
        }
      });

      return NextResponse.json({
        success: true,
        appointmentType: updatedLocalAppointmentType
      });

    } catch (nexhealthError) {
      console.error("Error updating appointment type in NexHealth:", nexhealthError);
      
      // Update local record with error
      await prisma.appointmentType.update({
        where: { id: appointmentTypeId },
        data: {
          lastSyncError: nexhealthError instanceof Error ? nexhealthError.message : 'Unknown NexHealth error'
        }
      });

      return NextResponse.json({
        error: nexhealthError instanceof Error ? nexhealthError.message : 'Failed to update appointment type in NexHealth'
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Error updating appointment type:", error);
    return NextResponse.json(
      { error: "Failed to update appointment type" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { appointmentTypeId } = await params;

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json({
        error: "NexHealth configuration is required to delete appointment types"
      }, { status: 400 });
    }

    // Fetch the local appointment type record to get the NexHealth ID
    const localAppointmentType = await prisma.appointmentType.findFirst({
      where: {
        id: appointmentTypeId,
        practiceId: practice.id
      }
    });

    if (!localAppointmentType) {
      return NextResponse.json({
        error: "Appointment type not found"
      }, { status: 404 });
    }

    try {
      // Delete appointment type from NexHealth
      await deleteNexhealthAppointmentType(
        practice.nexhealthSubdomain,
        localAppointmentType.nexhealthAppointmentTypeId,
        practice.nexhealthLocationId
      );

      // Delete appointment type from local database
      await prisma.appointmentType.delete({
        where: { id: appointmentTypeId }
      });

      return NextResponse.json({
        success: true,
        message: "Appointment type deleted successfully"
      });

    } catch (nexhealthError) {
      console.error("Error deleting appointment type from NexHealth:", nexhealthError);
      return NextResponse.json({
        error: nexhealthError instanceof Error ? nexhealthError.message : 'Failed to delete appointment type from NexHealth'
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Error deleting appointment type:", error);
    return NextResponse.json(
      { error: "Failed to delete appointment type" },
      { status: 500 }
    );
  }
} 