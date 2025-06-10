import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { providerIds, setAsDefault } = await req.json();

    if (!Array.isArray(providerIds)) {
      return NextResponse.json({ error: "providerIds must be an array" }, { status: 400 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Clear existing default if setting new default
    if (setAsDefault) {
      await prisma.savedProvider.updateMany({
        where: { practiceId: practice.id },
        data: { isDefault: false }
      });
    }

    // First, deactivate all existing saved providers for this practice
    await prisma.savedProvider.updateMany({
      where: { practiceId: practice.id },
      data: { isActive: false }
    });

    // Save selected providers
    const savedProviders = await Promise.all(
      providerIds.map(async (providerId: string, index: number) => {
        return prisma.savedProvider.upsert({
          where: {
            practiceId_providerId: {
              practiceId: practice.id,
              providerId
            }
          },
          update: {
            isActive: true,
            isDefault: setAsDefault && index === 0
          },
          create: {
            practiceId: practice.id,
            providerId,
            isActive: true,
            isDefault: setAsDefault && index === 0
          }
        });
      })
    );

    return NextResponse.json({ 
      success: true, 
      savedProviders: savedProviders.length 
    });

  } catch (error) {
    console.error("Error saving providers:", error);
    return NextResponse.json(
      { error: "Failed to save providers" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { providerIds } = await req.json();

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    await prisma.savedProvider.deleteMany({
      where: {
        practiceId: practice.id,
        providerId: { in: providerIds }
      }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error removing providers:", error);
    return NextResponse.json(
      { error: "Failed to remove providers" },
      { status: 500 }
    );
  }
} 