import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProviders, getOperatories, syncPracticeAppointmentTypes } from "@/lib/nexhealth";

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

interface NexHealthOperatory {
  id: number;
  name?: string;
  active?: boolean;
  location_id?: number;
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

    console.log(`Starting sync for practice ${practice.id} with NexHealth subdomain: ${practice.nexhealthSubdomain}, location: ${practice.nexhealthLocationId}`);

    // Fetch data from NexHealth (including appointment types)
    const [providers, operatories] = await Promise.all([
      getProviders(practice.nexhealthSubdomain, practice.nexhealthLocationId),
      getOperatories(practice.nexhealthSubdomain, practice.nexhealthLocationId),
    ]);

    console.log(`Fetched ${providers.length} providers and ${operatories.length} operatories from NexHealth`);

    // Sync appointment types from NexHealth
    console.log('Syncing appointment types from NexHealth...');
    try {
      await syncPracticeAppointmentTypes(
        practice.id,
        practice.nexhealthSubdomain,
        practice.nexhealthLocationId
      );
      console.log('✅ Appointment types sync completed');
    } catch (appointmentTypesError) {
      console.error('❌ Error syncing appointment types:', appointmentTypesError);
      // Continue with other syncing even if appointment types fail
    }

    // Track sync results
    let providersCreated = 0;
    let providersUpdated = 0;
    let operatoriesCreated = 0;
    let operatoriesUpdated = 0;

    // Sync providers
    const providerPromises = providers.map(async (provider: NexHealthProvider) => {
      const result = await prisma.provider.upsert({
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
      });

      // Check if this was a create or update operation by checking if the record was just created
      const existingProvider = await prisma.provider.findFirst({
        where: {
          practiceId: practice.id,
          nexhealthProviderId: provider.id.toString(),
          createdAt: { gte: new Date(Date.now() - 1000) } // Created within last second
        }
      });

      if (existingProvider && existingProvider.createdAt > new Date(Date.now() - 1000)) {
        providersCreated++;
      } else {
        providersUpdated++;
      }

      return result;
    });

    // Sync operatories with refined logic for newly created vs updated
    const operatoryPromises = operatories.map(async (operatory: NexHealthOperatory) => {
      // First check if operatory already exists
      const existingOperatory = await prisma.savedOperatory.findFirst({
        where: {
          practiceId: practice.id,
          nexhealthOperatoryId: operatory.id.toString(),
        }
      });

      if (existingOperatory) {
        // Update existing operatory - keep existing isActive status
        const result = await prisma.savedOperatory.update({
          where: { id: existingOperatory.id },
          data: {
            name: operatory.name || `Operatory ${operatory.id}`,
            // Keep existing isActive status for updates
          }
        });
        operatoriesUpdated++;
        return result;
      } else {
        // Create new operatory - default to isActive: false for new operatories
        const result = await prisma.savedOperatory.create({
          data: {
            practiceId: practice.id,
            nexhealthOperatoryId: operatory.id.toString(),
            name: operatory.name || `Operatory ${operatory.id}`,
            isActive: false, // New operatories default to inactive until explicitly configured
          }
        });
        operatoriesCreated++;
        return result;
      }
    });

    // Execute all upserts
    await Promise.all([...providerPromises, ...operatoryPromises]);

    console.log(`Sync completed: ${providersCreated} providers created, ${providersUpdated} providers updated, ${operatoriesCreated} operatories created, ${operatoriesUpdated} operatories updated`);

    // Get final appointment types count
    const finalAppointmentTypesCount = await prisma.appointmentType.count({
      where: { practiceId: practice.id }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${providers.length} providers, ${operatories.length} operatories, and appointment types from NexHealth.`,
      data: {
        providersCount: providers.length,
        operatoriesCount: operatories.length,
        appointmentTypesCount: finalAppointmentTypesCount,
        details: {
          providers: {
            created: providersCreated,
            updated: providersUpdated
          },
          operatories: {
            created: operatoriesCreated,
            updated: operatoriesUpdated
          }
        }
      },
    });
  } catch (error) {
    console.error("Error syncing NexHealth data:", error);
    
    // Provide more specific error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      { 
        error: "Failed to sync NexHealth data. Please check your configuration and try again.",
        details: errorMessage
      },
      { status: 500 }
    );
  }
} 