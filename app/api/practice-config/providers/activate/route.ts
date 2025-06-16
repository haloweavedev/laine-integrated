import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const activateProviderSchema = z.object({
  providerIds: z.array(z.string()).min(1, "At least one provider ID is required")
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validationResult = activateProviderSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({
        error: "Invalid input",
        details: validationResult.error.issues
      }, { status: 400 });
    }

    const { providerIds } = validationResult.data;

    // Get the practice
    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Verify all provider IDs belong to this practice
    const providers = await prisma.provider.findMany({
      where: {
        id: { in: providerIds },
        practiceId: practice.id
      }
    });

    if (providers.length !== providerIds.length) {
      return NextResponse.json({
        error: "Some providers don't belong to this practice"
      }, { status: 400 });
    }

    // Create SavedProvider records for each provider
    const savedProviderPromises = providers.map(provider =>
      prisma.savedProvider.upsert({
        where: {
          practiceId_providerId: {
            practiceId: practice.id,
            providerId: provider.id
          }
        },
        update: {
          isActive: true
        },
        create: {
          practiceId: practice.id,
          providerId: provider.id,
          isActive: true
        }
      })
    );

    const savedProviders = await Promise.all(savedProviderPromises);

    return NextResponse.json({
      success: true,
      message: `Successfully activated ${savedProviders.length} provider(s)`,
      activatedProviders: savedProviders.length
    });

  } catch (error) {
    console.error("Error activating providers:", error);
    return NextResponse.json(
      { error: "Failed to activate providers" },
      { status: 500 }
    );
  }
} 