import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const activateBatchProvidersSchema = z.object({
  providerIds: z.array(z.string().cuid()).min(1, "At least one provider ID is required")
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validationResult = activateBatchProvidersSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({
        error: "Validation failed",
        issues: validationResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      }, { status: 400 });
    }

    const { providerIds } = validationResult.data;

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Validate that all provider IDs belong to this practice's synced providers
    const validProviders = await prisma.provider.findMany({
      where: {
        id: { in: providerIds },
        practiceId: practice.id
      }
    });

    if (validProviders.length !== providerIds.length) {
      const foundIds = validProviders.map(p => p.id);
      const invalidIds = providerIds.filter(id => !foundIds.includes(id));
      return NextResponse.json({
        error: "Some provider IDs don't belong to this practice",
        invalidIds
      }, { status: 400 });
    }

    // Use transaction to ensure atomicity when processing multiple providers
    const result = await prisma.$transaction(async (tx) => {
      const activationResults = {
        newlyActivated: 0,
        reactivated: 0,
        alreadyActive: 0
      };

      for (const providerId of providerIds) {
        const existingSavedProvider = await tx.savedProvider.findFirst({
          where: {
            providerId,
            practiceId: practice.id
          }
        });

        if (existingSavedProvider) {
          if (!existingSavedProvider.isActive) {
            // Reactivate existing inactive provider
            await tx.savedProvider.update({
              where: { id: existingSavedProvider.id },
              data: { isActive: true }
            });
            activationResults.reactivated++;
          } else {
            // Already active
            activationResults.alreadyActive++;
          }
        } else {
          // Create new SavedProvider record
          await tx.savedProvider.create({
            data: {
              practiceId: practice.id,
              providerId,
              isActive: true
            }
          });
          activationResults.newlyActivated++;
        }
      }

      return activationResults;
    });

    return NextResponse.json({
      success: true,
      message: `Provider activation completed`,
      results: result
    });

  } catch (error) {
    console.error("Error activating providers:", error);
    return NextResponse.json(
      { error: "Failed to activate providers" },
      { status: 500 }
    );
  }
} 