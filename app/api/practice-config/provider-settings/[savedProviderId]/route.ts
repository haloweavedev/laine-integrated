import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

interface RouteParams {
  savedProviderId: string;
}

const updateProviderSettingsSchema = z.object({
  acceptedAppointmentTypeIds: z.array(z.string().cuid("Invalid appointment type ID format"))
    .optional()
    .transform(arr => arr || []),
  assignedOperatoryIds: z.array(z.string().cuid("Invalid operatory ID format"))
    .optional()
    .transform(arr => arr || []),
  isActive: z.boolean().optional()
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { savedProviderId } = await params;

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Fetch the saved provider with all related data
    const savedProvider = await prisma.savedProvider.findFirst({
      where: {
        id: savedProviderId,
        practiceId: practice.id
      },
      include: {
        provider: {
          select: {
            id: true,
            nexhealthProviderId: true,
            firstName: true,
            lastName: true
          }
        },
        acceptedAppointmentTypes: {
          include: {
            appointmentType: {
              select: {
                id: true,
                name: true,
                nexhealthAppointmentTypeId: true,
                duration: true
              }
            }
          }
        },
        assignedOperatories: {
          include: {
            savedOperatory: {
              select: {
                id: true,
                name: true,
                nexhealthOperatoryId: true
              }
            }
          }
        }
      }
    });

    if (!savedProvider) {
      return NextResponse.json({ 
        error: "Provider not found or doesn't belong to this practice" 
      }, { status: 404 });
    }

    // Format the response
    const response = {
      id: savedProvider.id,
      provider: savedProvider.provider,
      isActive: savedProvider.isActive,
      acceptedAppointmentTypes: savedProvider.acceptedAppointmentTypes.map((relation: { appointmentType: { id: string; name: string; nexhealthAppointmentTypeId: string; duration: number } }) => relation.appointmentType),
      assignedOperatories: savedProvider.assignedOperatories?.map((assignment: { savedOperatory: { id: string; name: string; nexhealthOperatoryId: string } }) => assignment.savedOperatory) || [],
      createdAt: savedProvider.createdAt,
      updatedAt: savedProvider.updatedAt
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Error fetching provider settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch provider settings" },
      { status: 500 }
    );
  }
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

    const { savedProviderId } = await params;
    const body = await req.json();

    console.log('🔍 Provider Settings Save Request:', {
      savedProviderId,
      body,
      bodyKeys: Object.keys(body),
      bodyTypes: Object.keys(body).map(key => `${key}: ${typeof body[key]}`)
    });

    // Validate input
    const validationResult = updateProviderSettingsSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('❌ Validation failed:', validationResult.error.issues);
      return NextResponse.json({
        error: "Validation failed",
        details: validationResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      }, { status: 400 });
    }

    const { acceptedAppointmentTypeIds, assignedOperatoryIds, isActive } = validationResult.data;

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Verify the saved provider belongs to this practice
    const savedProvider = await prisma.savedProvider.findFirst({
      where: {
        id: savedProviderId,
        practiceId: practice.id
      },
      include: {
        assignedOperatories: true // Include current operatories for validation
      }
    });

    if (!savedProvider) {
      return NextResponse.json({ 
        error: "Provider not found or doesn't belong to this practice" 
      }, { status: 404 });
    }

    // Validate appointment type IDs belong to practice if provided
    if (acceptedAppointmentTypeIds.length > 0) {
      const validAppointmentTypes = await prisma.appointmentType.findMany({
        where: {
          id: { in: acceptedAppointmentTypeIds },
          practiceId: practice.id
        }
      });

      if (validAppointmentTypes.length !== acceptedAppointmentTypeIds.length) {
        const foundIds = validAppointmentTypes.map(at => at.id);
        const invalidIds = acceptedAppointmentTypeIds.filter(id => !foundIds.includes(id));
        return NextResponse.json({
          error: "Some appointment types don't belong to this practice",
          details: `Invalid appointment type IDs: ${invalidIds.join(', ')}`
        }, { status: 400 });
      }
    }

    // Validate assigned operatory IDs belong to practice if provided
    if (assignedOperatoryIds.length > 0) {
      const validOperatories = await prisma.savedOperatory.findMany({
        where: {
          id: { in: assignedOperatoryIds },
          practiceId: practice.id,
          isActive: true
        }
      });

      if (validOperatories.length !== assignedOperatoryIds.length) {
        const foundIds = validOperatories.map(op => op.id);
        const invalidIds = assignedOperatoryIds.filter(id => !foundIds.includes(id));
        return NextResponse.json({
          error: "Some operatories don't belong to this practice or are not active",
          details: `Invalid or inactive operatory IDs: ${invalidIds.join(', ')}`
        }, { status: 400 });
      }
    }

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // MANDATORY OPERATORY ASSIGNMENT VALIDATION
      // If isActive is being set to true, ensure operatories are assigned
      if (isActive === true) {
        // Check what operatories will be assigned after this update
        const finalOperatoryIds = assignedOperatoryIds.length > 0 
          ? assignedOperatoryIds 
          : savedProvider.assignedOperatories.map(ao => ao.savedOperatoryId);
        
        if (finalOperatoryIds.length === 0) {
          throw new Error("An active provider must be assigned at least one operatory. Please assign at least one operatory before activating this provider.");
        }
      }

      // Update SavedProvider record if isActive is provided
      if (isActive !== undefined) {
        await tx.savedProvider.update({
          where: { id: savedProviderId },
          data: { isActive }
        });
      }

      // Manage accepted appointment types
      if (acceptedAppointmentTypeIds !== undefined) {
        // Delete existing associations
        await tx.providerAcceptedAppointmentType.deleteMany({
          where: { savedProviderId }
        });

        // Create new associations if any provided
        if (acceptedAppointmentTypeIds.length > 0) {
          await tx.providerAcceptedAppointmentType.createMany({
            data: acceptedAppointmentTypeIds.map(appointmentTypeId => ({
              savedProviderId,
              appointmentTypeId
            }))
          });
        }
      }

      // Manage assigned operatories
      if (assignedOperatoryIds !== undefined) {
        // Delete existing operatory assignments
        await tx.providerOperatoryAssignment.deleteMany({
          where: { savedProviderId }
        });

        // Create new operatory assignments if any provided
        if (assignedOperatoryIds.length > 0) {
          await tx.providerOperatoryAssignment.createMany({
            data: assignedOperatoryIds.map(savedOperatoryId => ({
              savedProviderId,
              savedOperatoryId
            }))
          });
        }
      }
    });

    // Fetch the updated provider with all related data for response
    const responseData = await prisma.savedProvider.findUnique({
      where: { id: savedProviderId },
      include: {
        provider: {
          select: {
            id: true,
            nexhealthProviderId: true,
            firstName: true,
            lastName: true
          }
        },
        acceptedAppointmentTypes: {
          include: {
            appointmentType: {
              select: {
                id: true,
                name: true,
                nexhealthAppointmentTypeId: true,
                duration: true,
                spokenName: true,
                check_immediate_next_available: true
              }
            }
          }
        },
        assignedOperatories: {
          include: {
            savedOperatory: {
              select: {
                id: true,
                name: true,
                nexhealthOperatoryId: true
              }
            }
          }
        }
      }
    });

    console.log(`✅ Provider settings updated successfully for ${savedProviderId}`);

    return NextResponse.json({
      success: true,
      message: "Provider settings updated successfully",
      provider: {
        id: responseData?.id,
        provider: responseData?.provider,
        isActive: responseData?.isActive,
        acceptedAppointmentTypes: responseData?.acceptedAppointmentTypes.map(relation => relation.appointmentType) || [],
        assignedOperatories: responseData?.assignedOperatories?.map(assignment => assignment.savedOperatory) || [],
        createdAt: responseData?.createdAt,
        updatedAt: responseData?.updatedAt
      }
    });

  } catch (error) {
    console.error("Error updating provider settings:", error);
    
    // Handle specific business logic errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Check if it's a mandatory operatory assignment error
    if (errorMessage.includes('operatory')) {
      return NextResponse.json(
        { 
          error: errorMessage,
          code: 'MANDATORY_OPERATORY_REQUIRED'
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to update provider settings",
        details: errorMessage
      },
      { status: 500 }
    );
  }
} 