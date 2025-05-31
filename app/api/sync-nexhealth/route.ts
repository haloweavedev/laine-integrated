import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppointmentTypes, getProviders } from "@/lib/nexhealth";

interface NexHealthAppointmentType {
  id: number;
  name: string;
  minutes: number;
  parent_type: string;
  parent_id: number;
  bookable_online: boolean;
}

interface NexHealthProvider {
  id: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  inactive?: boolean;
  npi?: string;
  specialty_code?: string;
  nexhealth_specialty?: string;
}

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the practice for this user
    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId },
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json(
        { error: "NexHealth configuration missing. Please configure your subdomain and location ID first." },
        { status: 400 }
      );
    }

    // Fetch data from NexHealth
    const [appointmentTypes, providers] = await Promise.all([
      getAppointmentTypes(practice.nexhealthSubdomain, practice.nexhealthLocationId),
      getProviders(practice.nexhealthSubdomain, practice.nexhealthLocationId),
    ]);

    // Sync appointment types - use 'minutes' from NexHealth API
    const appointmentTypePromises = appointmentTypes.map((type: NexHealthAppointmentType) =>
      prisma.appointmentType.upsert({
        where: {
          practiceId_nexhealthAppointmentTypeId: {
            practiceId: practice.id,
            nexhealthAppointmentTypeId: type.id.toString(),
          },
        },
        update: {
          name: type.name,
          duration: type.minutes || 0, // Use 'minutes' from NexHealth API
        },
        create: {
          practiceId: practice.id,
          nexhealthAppointmentTypeId: type.id.toString(),
          name: type.name,
          duration: type.minutes || 0, // Use 'minutes' from NexHealth API
        },
      })
    );

    // Sync providers
    const providerPromises = providers.map((provider: NexHealthProvider) =>
      prisma.provider.upsert({
        where: {
          practiceId_nexhealthProviderId: {
            practiceId: practice.id,
            nexhealthProviderId: provider.id.toString(),
          },
        },
        update: {
          firstName: provider.first_name || null,
          lastName: provider.last_name || provider.name || "Unknown",
        },
        create: {
          practiceId: practice.id,
          nexhealthProviderId: provider.id.toString(),
          firstName: provider.first_name || null,
          lastName: provider.last_name || provider.name || "Unknown",
        },
      })
    );

    // Execute all upserts
    await Promise.all([...appointmentTypePromises, ...providerPromises]);

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${appointmentTypes.length} appointment types and ${providers.length} providers.`,
      data: {
        appointmentTypesCount: appointmentTypes.length,
        providersCount: providers.length,
      },
    });
  } catch (error) {
    console.error("Error syncing NexHealth data:", error);
    return NextResponse.json(
      { error: "Failed to sync NexHealth data. Please check your configuration and try again." },
      { status: 500 }
    );
  }
} 