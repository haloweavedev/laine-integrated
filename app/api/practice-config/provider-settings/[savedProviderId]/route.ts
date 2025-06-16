import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

interface RouteParams {
  savedProviderId: string;
}

const updateProviderSettingsSchema = z.object({
  acceptedAppointmentTypeIds: z.array(z.string()).optional(),
  defaultAppointmentTypeId: z.string().nullable().optional(),
  defaultOperatoryId: z.string().nullable().optional()
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
        defaultAppointmentType: {
          select: {
            id: true,
            name: true,
            nexhealthAppointmentTypeId: true,
            duration: true,
            groupCode: true
          }
        },
        defaultOperatory: {
          select: {
            id: true,
            name: true,
            nexhealthOperatoryId: true
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
                groupCode: true
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
      defaultAppointmentType: savedProvider.defaultAppointmentType,
      defaultOperatory: savedProvider.defaultOperatory,
      acceptedAppointmentTypes: savedProvider.acceptedAppointmentTypes.map(relation => relation.appointmentType),
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

    // Validate input
    const validationResult = updateProviderSettingsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({
        error: "Invalid input",
        details: validationResult.error.issues
      }, { status: 400 });
    }

    const { acceptedAppointmentTypeIds, defaultAppointmentTypeId, defaultOperatoryId } = validationResult.data;

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
      }
    });

    if (!savedProvider) {
      return NextResponse.json({ 
        error: "Provider not found or doesn't belong to this practice" 
      }, { status: 404 });
    }

    // Validate appointment type IDs belong to practice if provided
    if (acceptedAppointmentTypeIds && acceptedAppointmentTypeIds.length > 0) {
      const validAppointmentTypes = await prisma.appointmentType.findMany({
        where: {
          id: { in: acceptedAppointmentTypeIds },
          practiceId: practice.id
        }
      });

      if (validAppointmentTypes.length !== acceptedAppointmentTypeIds.length) {
        return NextResponse.json({
          error: "Some appointment types don't belong to this practice"
        }, { status: 400 });
      }
    }

    // Validate default appointment type belongs to practice if provided
    if (defaultAppointmentTypeId) {
      const defaultAppointmentType = await prisma.appointmentType.findFirst({
        where: {
          id: defaultAppointmentTypeId,
          practiceId: practice.id
        }
      });

      if (!defaultAppointmentType) {
        return NextResponse.json({
          error: "Default appointment type doesn't belong to this practice"
        }, { status: 400 });
      }
    }

    // Validate default operatory belongs to practice if provided
    if (defaultOperatoryId) {
      const defaultOperatory = await prisma.savedOperatory.findFirst({
        where: {
          id: defaultOperatoryId,
          practiceId: practice.id,
          isActive: true
        }
      });

      if (!defaultOperatory) {
        return NextResponse.json({
          error: "Default operatory doesn't belong to this practice or is not active"
        }, { status: 400 });
      }
    }

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Update the SavedProvider record with defaults
      const updated = await tx.savedProvider.update({
        where: { id: savedProviderId },
        data: {
          defaultAppointmentTypeId: defaultAppointmentTypeId !== undefined ? defaultAppointmentTypeId : undefined,
          defaultOperatoryId: defaultOperatoryId !== undefined ? defaultOperatoryId : undefined
        }
      });

      // Manage accepted appointment types if provided
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

      return updated;
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
        defaultAppointmentType: {
          select: {
            id: true,
            name: true,
            nexhealthAppointmentTypeId: true,
            duration: true,
            groupCode: true
          }
        },
        defaultOperatory: {
          select: {
            id: true,
            name: true,
            nexhealthOperatoryId: true
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
                groupCode: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      provider: {
        ...responseData,
        acceptedAppointmentTypes: responseData?.acceptedAppointmentTypes.map(relation => relation.appointmentType)
      }
    });

  } catch (error) {
    console.error("Error updating provider settings:", error);
    return NextResponse.json(
      { error: "Failed to update provider settings" },
      { status: 500 }
    );
  }
} 