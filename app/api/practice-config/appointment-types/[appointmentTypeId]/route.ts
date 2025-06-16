import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { 
  updateNexhealthAppointmentType, 
  deleteNexhealthAppointmentType 
} from "@/lib/nexhealth";
import { z } from "zod";

interface RouteParams {
  appointmentTypeId: string;
}

const updateAppointmentTypeSchema = z.object({
  name: z.string().min(1, "Name must be a non-empty string").optional(),
  minutes: z.number().positive("Minutes must be a positive number").optional(),
  bookableOnline: z.boolean().optional(),
  groupCode: z.string().nullable().optional()
});

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

    const body = await req.json();

    // Validate input using Zod
    const validationResult = updateAppointmentTypeSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({
        error: "Invalid input",
        details: validationResult.error.issues
      }, { status: 400 });
    }

    const { name, minutes, bookableOnline, groupCode } = validationResult.data;

    // Build update data object with only provided fields for NexHealth
    const nexhealthUpdateData: {
      name?: string;
      minutes?: number;
      bookable_online?: boolean;
    } = {};

    if (name !== undefined) {
      nexhealthUpdateData.name = name.trim();
    }

    if (minutes !== undefined) {
      nexhealthUpdateData.minutes = minutes;
    }

    if (bookableOnline !== undefined) {
      nexhealthUpdateData.bookable_online = bookableOnline;
    }

    try {
      // Build local update data (includes groupCode which is Laine-specific)
      const localUpdateData: {
        name?: string;
        duration?: number;
        bookableOnline?: boolean;
        groupCode?: string | null;
        parentType?: string;
        parentId?: string;
        lastSyncError?: null;
      } = {};

      // Update appointment type in NexHealth (only if there are NexHealth-relevant fields)
      if (Object.keys(nexhealthUpdateData).length > 0) {
        const nexhealthResponse = await updateNexhealthAppointmentType(
          practice.nexhealthSubdomain,
          localAppointmentType.nexhealthAppointmentTypeId,
          practice.nexhealthLocationId,
          nexhealthUpdateData
        );

        // Update local data with NexHealth response
        if (nexhealthResponse.name !== localAppointmentType.name) {
          localUpdateData.name = nexhealthResponse.name;
        }
        if (nexhealthResponse.minutes !== localAppointmentType.duration) {
          localUpdateData.duration = nexhealthResponse.minutes;
        }
        if (nexhealthResponse.bookable_online !== localAppointmentType.bookableOnline) {
          localUpdateData.bookableOnline = nexhealthResponse.bookable_online;
        }
        if (nexhealthResponse.parent_type !== localAppointmentType.parentType) {
          localUpdateData.parentType = nexhealthResponse.parent_type;
        }
        if (nexhealthResponse.parent_id.toString() !== localAppointmentType.parentId) {
          localUpdateData.parentId = nexhealthResponse.parent_id.toString();
        }
      }

      // Add groupCode update if provided (Laine-specific field)
      if (groupCode !== undefined) {
        localUpdateData.groupCode = groupCode;
      }

      // Clear any previous sync errors if we made changes
      if (Object.keys(localUpdateData).length > 0) {
        localUpdateData.lastSyncError = null;
      }

      // Update appointment type in local database
      const updatedLocalAppointmentType = await prisma.appointmentType.update({
        where: { id: appointmentTypeId },
        data: localUpdateData
      });

      return NextResponse.json({
        success: true,
        appointmentType: updatedLocalAppointmentType
      });

    } catch (nexhealthError) {
      console.error("Error updating appointment type in NexHealth:", nexhealthError);
      
      // If only groupCode was being updated and NexHealth call failed, still update locally
      if (Object.keys(nexhealthUpdateData).length === 0 && groupCode !== undefined) {
        const updatedLocalAppointmentType = await prisma.appointmentType.update({
          where: { id: appointmentTypeId },
          data: { groupCode }
        });

        return NextResponse.json({
          success: true,
          appointmentType: updatedLocalAppointmentType
        });
      }

      // Update local record with error for NexHealth-related fields
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