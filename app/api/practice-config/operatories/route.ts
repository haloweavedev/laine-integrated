import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { operatories, setAsDefault } = await req.json();

    if (!Array.isArray(operatories)) {
      return NextResponse.json({ error: "operatories must be an array" }, { status: 400 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Clear existing default if setting new default
    if (setAsDefault) {
      await prisma.savedOperatory.updateMany({
        where: { practiceId: practice.id },
        data: { isDefault: false }
      });
    }

    // Save selected operatories
    const savedOperatories = await Promise.all(
      operatories.map(async (operatory: { id: string; name: string }, index: number) => {
        return prisma.savedOperatory.upsert({
          where: {
            practiceId_nexhealthOperatoryId: {
              practiceId: practice.id,
              nexhealthOperatoryId: operatory.id
            }
          },
          update: {
            name: operatory.name,
            isActive: true,
            isDefault: setAsDefault && index === 0
          },
          create: {
            practiceId: practice.id,
            nexhealthOperatoryId: operatory.id,
            name: operatory.name,
            isActive: true,
            isDefault: setAsDefault && index === 0
          }
        });
      })
    );

    return NextResponse.json({ 
      success: true, 
      savedOperatories: savedOperatories.length 
    });

  } catch (error) {
    console.error("Error saving operatories:", error);
    return NextResponse.json(
      { error: "Failed to save operatories" },
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

    const { operatoryIds } = await req.json();

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    await prisma.savedOperatory.deleteMany({
      where: {
        practiceId: practice.id,
        nexhealthOperatoryId: { in: operatoryIds }
      }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error removing operatories:", error);
    return NextResponse.json(
      { error: "Failed to remove operatories" },
      { status: 500 }
    );
  }
} 