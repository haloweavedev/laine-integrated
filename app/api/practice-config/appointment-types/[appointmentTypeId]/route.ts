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
  name: z.string()
    .min(1, "Name must be a non-empty string")
    .max(100, "Name must be 100 characters or less")
    .trim()
    .optional(),
  minutes: z.number()
    .int("Minutes must be a whole number")
    .min(5, "Duration must be at least 5 minutes")
    .max(480, "Duration must be 8 hours or less")
    .optional(),
  bookableOnline: z.boolean().optional(),
  spokenName: z.string().nullable().optional(),
  check_immediate_next_available: z.boolean().optional(),
  keywords: z.string().nullable().optional(),
  webPatientStatus: z.enum(["NEW", "RETURNING", "BOTH"]).optional()
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

    const { name, minutes, bookableOnline, spokenName, check_immediate_next_available, keywords, webPatientStatus } = validationResult.data;

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
      // Build local update data (includes spokenName, check_immediate_next_available, keywords and webPatientStatus which are Laine-specific)
      const localUpdateData: {
        name?: string;
        duration?: number;
        bookableOnline?: boolean;
        spokenName?: string | null;
        check_immediate_next_available?: boolean;
        keywords?: string | null;
        webPatientStatus?: "NEW" | "RETURNING" | "BOTH";
        parentType?: string;
        parentId?: string;
        lastSyncError?: null;
      } = {};

      // Update appointment type in NexHealth (only if there are NexHealth-relevant fields)
      if (Object.keys(nexhealthUpdateData).length > 0) {
        console.log(`Updating NexHealth appointment type ${localAppointmentType.nexhealthAppointmentTypeId} with data:`, nexhealthUpdateData);
        
        const nexhealthResponse = await updateNexhealthAppointmentType(
          practice.nexhealthSubdomain,
          localAppointmentType.nexhealthAppointmentTypeId,
          practice.nexhealthLocationId,
          nexhealthUpdateData
        );

        // Update local data with NexHealth response to ensure consistency
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
        
        console.log(`Successfully updated NexHealth appointment type ${localAppointmentType.nexhealthAppointmentTypeId}`);
      }

      // Add spokenName, check_immediate_next_available, keywords and webPatientStatus updates if provided (Laine-specific fields)
      if (spokenName !== undefined) {
        localUpdateData.spokenName = spokenName;
      }
      if (check_immediate_next_available !== undefined) {
        localUpdateData.check_immediate_next_available = check_immediate_next_available;
      }
      if (keywords !== undefined) {
        localUpdateData.keywords = keywords;
      }
      if (webPatientStatus !== undefined) {
        localUpdateData.webPatientStatus = webPatientStatus;
      }

      // Clear any previous sync errors on successful update
      if (Object.keys(localUpdateData).length > 0) {
        localUpdateData.lastSyncError = null;
      }

      // Update appointment type in local database
      const updatedLocalAppointmentType = await prisma.appointmentType.update({
        where: { id: appointmentTypeId },
        data: localUpdateData
      });

      console.log(`Successfully updated local appointment type ${appointmentTypeId}`);

      return NextResponse.json({
        success: true,
        appointmentType: updatedLocalAppointmentType
      });

    } catch (nexhealthError) {
      console.error("Error updating appointment type in NexHealth:", nexhealthError);
      
      // If only spokenName/check_immediate_next_available/keywords/webPatientStatus were being updated and NexHealth call failed, still update locally
      if (Object.keys(nexhealthUpdateData).length === 0 && (spokenName !== undefined || check_immediate_next_available !== undefined || keywords !== undefined || webPatientStatus !== undefined)) {
        const localOnlyData: { spokenName?: string | null; check_immediate_next_available?: boolean; keywords?: string | null; webPatientStatus?: "NEW" | "RETURNING" | "BOTH" } = {};
        if (spokenName !== undefined) localOnlyData.spokenName = spokenName;
        if (check_immediate_next_available !== undefined) localOnlyData.check_immediate_next_available = check_immediate_next_available;
        if (keywords !== undefined) localOnlyData.keywords = keywords;
        if (webPatientStatus !== undefined) localOnlyData.webPatientStatus = webPatientStatus;
        
        const updatedLocalAppointmentType = await prisma.appointmentType.update({
          where: { id: appointmentTypeId },
          data: localOnlyData
        });

        console.log(`Updated local-only fields for appointment type ${appointmentTypeId}`);

        return NextResponse.json({
          success: true,
          appointmentType: updatedLocalAppointmentType,
          warning: "Only Laine-specific fields were updated. NexHealth synchronization is not affected."
        });
      }

      // Update local record with error for NexHealth-related fields
      const errorMessage = nexhealthError instanceof Error ? nexhealthError.message : 'Unknown NexHealth error';
      
      await prisma.appointmentType.update({
        where: { id: appointmentTypeId },
        data: {
          lastSyncError: errorMessage
        }
      });

      return NextResponse.json({
        error: `NexHealth API Error: ${errorMessage}`,
        details: "The appointment type sync error has been logged. Please try again or contact support if the issue persists."
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Error updating appointment type:", error);
    return NextResponse.json(
      { error: "Internal server error while updating appointment type" },
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
      console.log(`Deleting appointment type from NexHealth: ${localAppointmentType.nexhealthAppointmentTypeId}`);
      
      // Delete appointment type from NexHealth first
      await deleteNexhealthAppointmentType(
        practice.nexhealthSubdomain,
        localAppointmentType.nexhealthAppointmentTypeId,
        practice.nexhealthLocationId
      );

      console.log(`Successfully deleted from NexHealth: ${localAppointmentType.nexhealthAppointmentTypeId}`);

      // Delete appointment type from local database only after successful NexHealth deletion
      await prisma.appointmentType.delete({
        where: { id: appointmentTypeId }
      });

      console.log(`Successfully deleted local appointment type: ${appointmentTypeId}`);

      return NextResponse.json({
        success: true,
        message: "Appointment type deleted successfully from both Laine and NexHealth"
      });

    } catch (nexhealthError) {
      console.error("Error deleting appointment type from NexHealth:", nexhealthError);
      
      // Extract meaningful error message
      const errorMessage = nexhealthError instanceof Error ? nexhealthError.message : 'Unknown NexHealth error';
      
      // Don't delete locally if NexHealth deletion failed to maintain consistency
      return NextResponse.json({
        error: `NexHealth API Error: ${errorMessage}`,
        details: "Appointment type was not deleted to maintain consistency between Laine and NexHealth. Please try again or contact support if the issue persists."
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Error deleting appointment type:", error);
    return NextResponse.json(
      { error: "Internal server error while deleting appointment type" },
      { status: 500 }
    );
  }
} 