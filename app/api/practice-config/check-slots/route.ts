import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { z } from "zod";

interface NexhealthSlot {
  time: string;
  end_time: string;
  operatory_id?: number;
  [key: string]: unknown;
}

const checkSlotsSchema = z.object({
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "requestedDate must be in YYYY-MM-DD format"),
  appointmentTypeId: z.string().min(1, "appointmentTypeId is required"),
  providerIds: z.array(z.string()).optional().default([]),
  operatoryIds: z.array(z.string()).optional().default([]),
  daysToSearch: z.number().min(1).max(30).optional().default(1)
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId },
      include: {
        appointmentTypes: true,
        savedProviders: {
          include: {
            provider: true,
            defaultOperatory: true,
            acceptedAppointmentTypes: {
              include: {
                appointmentType: true
              }
            }
          },
          where: { isActive: true }
        },
        savedOperatories: {
          where: { isActive: true }
        }
      }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json({ 
        error: "NexHealth configuration incomplete. Please configure subdomain and location ID." 
      }, { status: 400 });
    }

    const body = await req.json();

    // Validate input using Zod
    const validationResult = checkSlotsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({
        error: "Invalid input",
        details: validationResult.error.issues
      }, { status: 400 });
    }

    const { requestedDate, appointmentTypeId, providerIds, operatoryIds, daysToSearch } = validationResult.data;

    // Validate appointment type belongs to practice
    const appointmentType = practice.appointmentTypes.find(
      at => at.nexhealthAppointmentTypeId === appointmentTypeId
    );

    if (!appointmentType) {
      return NextResponse.json({ 
        error: "Appointment type not found or doesn't belong to practice" 
      }, { status: 400 });
    }

    // NEW LOGIC: Determine providers based on accepted appointment types
    let eligibleProviders = practice.savedProviders.filter(sp => sp.isActive);

    // First, filter providers who accept this appointment type
    const providersWhoAcceptType = eligibleProviders.filter(sp => {
      // If provider has no accepted appointment types configured, include them (backward compatibility)
      if (sp.acceptedAppointmentTypes.length === 0) {
        return true;
      }
      // Otherwise, check if they accept this specific appointment type
      return sp.acceptedAppointmentTypes.some(
        relation => relation.appointmentType.id === appointmentType.id
      );
    });

    // Apply provider filter if specific providers were requested
    if (providerIds.length > 0) {
      eligibleProviders = providersWhoAcceptType.filter(sp => 
        providerIds.includes(sp.provider.id)
      );
    } else {
      eligibleProviders = providersWhoAcceptType;
    }

    if (eligibleProviders.length === 0) {
      return NextResponse.json({ 
        error: "No providers are configured to accept this appointment type" 
      }, { status: 400 });
    }

    // NEW LOGIC: Determine operatories for each provider
    const providerOperatoryPairs: Array<{
      provider: { id: string; nexhealthProviderId: string; firstName: string | null; lastName: string; };
      operatoryId: string | null;
    }> = [];

    for (const savedProvider of eligibleProviders) {
      if (operatoryIds.length > 0) {
        // If specific operatories were requested, check if provider's default operatory is in the list
        if (savedProvider.defaultOperatoryId && operatoryIds.includes(savedProvider.defaultOperatoryId)) {
          providerOperatoryPairs.push({
            provider: savedProvider.provider,
            operatoryId: savedProvider.defaultOperatoryId
          });
        } else {
          // If provider's default operatory is not in the requested list, 
          // we could either skip this provider or use the first requested operatory
          // For now, we'll use the first requested operatory if available
          const firstRequestedOperatory = practice.savedOperatories.find(so => 
            operatoryIds.includes(so.id) && so.isActive
          );
          if (firstRequestedOperatory) {
            providerOperatoryPairs.push({
              provider: savedProvider.provider,
              operatoryId: firstRequestedOperatory.id
            });
          }
        }
      } else {
        // No specific operatories requested, use provider's default operatory if available
        providerOperatoryPairs.push({
          provider: savedProvider.provider,
          operatoryId: savedProvider.defaultOperatoryId
        });
      }
    }

    // Prepare NexHealth API call parameters
    const nexhealthProviderIds = providerOperatoryPairs.map(pair => pair.provider.nexhealthProviderId);
    
    // Get unique operatory IDs and convert to NexHealth operatory IDs
    const uniqueOperatoryIds = [...new Set(
      providerOperatoryPairs
        .map(pair => pair.operatoryId)
        .filter((id): id is string => id !== null)
    )];

    const nexhealthOperatoryIds = uniqueOperatoryIds.length > 0 
      ? practice.savedOperatories
          .filter(so => uniqueOperatoryIds.includes(so.id))
          .map(so => so.nexhealthOperatoryId)
      : [];

    // Build NexHealth API parameters
    const params: Record<string, string | number | string[]> = {
      start_date: requestedDate,
      days: daysToSearch,
      'lids[]': [practice.nexhealthLocationId],
      'pids[]': nexhealthProviderIds,
      appointment_type_id: appointmentTypeId
    };

    // Add operatory IDs if we have any
    if (nexhealthOperatoryIds.length > 0) {
      params['operatory_ids[]'] = nexhealthOperatoryIds;
    }

    console.log("Checking appointment slots with new provider logic:", {
      eligibleProvidersCount: eligibleProviders.length,
      providersWhoAcceptType: providersWhoAcceptType.length,
      providerOperatoryPairs: providerOperatoryPairs.length,
      params
    });

    // Call NexHealth API
    const slotsResponse = await fetchNexhealthAPI(
      '/appointment_slots',
      practice.nexhealthSubdomain,
      params
    );

    // Parse response and extract slots
    const availableSlots: Array<NexhealthSlot & { provider_id: number; location_id: number }> = [];
    
    if (slotsResponse?.data && Array.isArray(slotsResponse.data)) {
      // Extract all slots from all providers
      for (const providerData of slotsResponse.data) {
        if (providerData.slots && Array.isArray(providerData.slots)) {
          availableSlots.push(...providerData.slots.map((slot: NexhealthSlot) => ({
            ...slot,
            provider_id: providerData.pid,
            location_id: providerData.lid
          })));
        }
      }
    }

    // Create provider lookup map
    const providerLookup = new Map();
    eligibleProviders.forEach(sp => {
      providerLookup.set(sp.provider.nexhealthProviderId, {
        id: sp.provider.id,
        nexhealthProviderId: sp.provider.nexhealthProviderId,
        name: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim(),
        defaultOperatory: sp.defaultOperatory ? {
          id: sp.defaultOperatory.id,
          name: sp.defaultOperatory.name,
          nexhealthOperatoryId: sp.defaultOperatory.nexhealthOperatoryId
        } : null
      });
    });

    // Create operatory lookup map
    const operatoryLookup = new Map();
    practice.savedOperatories.forEach(so => {
      operatoryLookup.set(so.nexhealthOperatoryId, {
        id: so.id,
        nexhealthOperatoryId: so.nexhealthOperatoryId,
        name: so.name
      });
    });

    // Format slots for display with enhanced information
    const formattedSlots = availableSlots.map((slot, index) => {
      // Parse the time string correctly to preserve the timezone
      const startTime = new Date(slot.time);
      const endTime = new Date(slot.end_time);
      
      // Use the timezone from the original date string for formatting
      const timeString = startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago' // Explicitly use Central Time to match NexHealth
      });

      const endTimeString = endTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago'
      });

      // Get provider and operatory details
      const providerInfo = providerLookup.get(slot.provider_id.toString()) || { 
        name: `Provider ${slot.provider_id}`, 
        nexhealthProviderId: slot.provider_id 
      };
      
      const operatoryInfo = slot.operatory_id ? 
        operatoryLookup.get(slot.operatory_id.toString()) || { 
          name: `Operatory ${slot.operatory_id}`, 
          nexhealthOperatoryId: slot.operatory_id 
        } : null;
      
      return {
        slot_id: `slot_${index}`,
        time: slot.time,
        end_time: slot.end_time,
        display_time: timeString,
        display_end_time: endTimeString,
        display_range: `${timeString} - ${endTimeString}`,
        operatory_id: slot.operatory_id,
        provider_id: slot.provider_id,
        location_id: slot.location_id,
        provider_info: providerInfo,
        operatory_info: operatoryInfo
      };
    });

    // Sort slots by time
    formattedSlots.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return NextResponse.json({
      success: true,
      params: params,
      response: slotsResponse,
      data: {
        requested_date: requestedDate,
        appointment_type: {
          id: appointmentType.nexhealthAppointmentTypeId,
          name: appointmentType.name,
          duration: appointmentType.duration,
          groupCode: appointmentType.groupCode
        },
        available_slots: formattedSlots,
        has_availability: formattedSlots.length > 0,
        total_slots_found: formattedSlots.length,
        debug_info: {
          total_active_providers: practice.savedProviders.length,
          providers_who_accept_type: providersWhoAcceptType.length,
          eligible_providers_after_filter: eligibleProviders.length,
          provider_operatory_pairs: providerOperatoryPairs.length,
          providers_used: eligibleProviders.map(sp => ({
            id: sp.provider.id,
            name: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim(),
            nexhealthProviderId: sp.provider.nexhealthProviderId,
            defaultOperatory: sp.defaultOperatory ? sp.defaultOperatory.name : null,
            acceptedAppointmentTypesCount: sp.acceptedAppointmentTypes.length
          })),
          operatories_used: uniqueOperatoryIds.map(id => {
            const operatory = practice.savedOperatories.find(so => so.id === id);
            return operatory ? {
              id: operatory.id,
              name: operatory.name,
              nexhealthOperatoryId: operatory.nexhealthOperatoryId
            } : null;
          }).filter(Boolean)
        }
      }
    });

  } catch (error) {
    console.error("Error checking appointment slots:", error);
    return NextResponse.json(
      { 
        error: "Failed to check appointment slots", 
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 