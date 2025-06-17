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

// Helper function to check if a time falls within lunch break (1-2 PM local time)
function isLunchBreakSlot(slotTimeString: string): boolean {
  try {
    // Parse the slot time which includes timezone info (e.g., "2025-12-29T07:00:00.000-06:00")
    const slotTime = new Date(slotTimeString);
    
    // For now, assuming Central Time (America/Chicago) for practice timezone
    // TODO: Store actual practice timezone in database
    const localTime = slotTime.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const [hour, minute] = localTime.split(':').map(Number);
    const totalMinutes = hour * 60 + minute;
    
    // Lunch break: 1:00 PM (13:00) to 2:00 PM (14:00) - 780 to 840 minutes from midnight
    const lunchStart = 13 * 60; // 1 PM in minutes
    const lunchEnd = 14 * 60;   // 2 PM in minutes
    
    return totalMinutes >= lunchStart && totalMinutes < lunchEnd;
  } catch (error) {
    console.error('Error parsing slot time for lunch break check:', error);
    return false; // If we can't parse, don't filter out the slot
  }
}

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
        providers: true,
        savedProviders: {
          include: {
            provider: true,
            acceptedAppointmentTypes: {
              include: {
                appointmentType: true
              }
            },
            assignedOperatories: {
              include: {
                savedOperatory: true
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

    // Log input parameters for debugging
    console.log("=== CHECK SLOTS API - INPUT PARAMETERS ===");
    console.log("Received appointmentTypeId (Laine CUID):", appointmentTypeId);
    console.log("Received requestedDate:", requestedDate);
    console.log("Received providerIds (SavedProvider CUIDs from frontend):", providerIds);
    console.log("Received operatoryIds (SavedOperatory CUIDs from frontend):", operatoryIds);
    console.log("Days to search:", daysToSearch);

    // CRUCIAL STEP A: Fetch the complete AppointmentType record using Laine CUID
    // Using direct Prisma fetch for safety instead of relying on practice.appointmentTypes
    const appointmentType = await prisma.appointmentType.findUnique({
      where: { 
        id: appointmentTypeId,
        practiceId: practice.id // Ensure it belongs to this practice
      }
    });

    if (!appointmentType) {
      console.log("❌ AppointmentType not found for Laine CUID:", appointmentTypeId);
      return NextResponse.json({ 
        error: "Appointment type not found or doesn't belong to practice" 
      }, { status: 400 });
    }

    // Log fetched AppointmentType details
    console.log("✅ Found AppointmentType:");
    console.log("  - Laine CUID:", appointmentType.id);
    console.log("  - Name:", appointmentType.name);
    console.log("  - Duration (for slot_length):", appointmentType.duration);
    console.log("  - NexHealth ID:", appointmentType.nexhealthAppointmentTypeId);

    // CRUCIAL STEP B: Find all SavedProviders who are active and accept this appointment type
    let eligibleSavedProviders = practice.savedProviders.filter(sp => {
      // Must be active
      if (!sp.isActive) return false;
      
      // If provider has no accepted appointment types configured, include them (backward compatibility)
      if (sp.acceptedAppointmentTypes.length === 0) {
        return true;
      }
      
      // Otherwise, check if they accept this specific appointment type using Laine CUID
      return sp.acceptedAppointmentTypes.some(
        relation => relation.appointmentType.id === appointmentType.id
      );
    });

    console.log("📋 Provider filtering - Step 1 (Active + Accept AppointmentType):");
    console.log("  - Total active SavedProviders in practice:", practice.savedProviders.length);
    console.log("  - SavedProviders accepting this AppointmentType:", eligibleSavedProviders.length);
    console.log("  - Eligible SavedProvider details:", eligibleSavedProviders.map(sp => ({
      savedProviderId: sp.id,
      providerName: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim(),
      providerId: sp.provider.id,
      nexhealthProviderId: sp.provider.nexhealthProviderId,
      acceptedAppointmentTypesCount: sp.acceptedAppointmentTypes.length
    })));

    // STEP 2: Apply optional provider filter
    // Frontend sends SavedProvider.id CUIDs, so filter by sp.id
    if (providerIds.length > 0) {
      const beforeFilterCount = eligibleSavedProviders.length;
      eligibleSavedProviders = eligibleSavedProviders.filter(sp => 
        providerIds.includes(sp.id) // Fixed: Compare against SavedProvider.id, not Provider.id
      );
      console.log("📋 Provider filtering - Step 2 (Optional provider filter):");
      console.log("  - Before provider filter:", beforeFilterCount);
      console.log("  - After provider filter:", eligibleSavedProviders.length);
      console.log("  - Provider filter CUIDs from frontend:", providerIds);
      console.log("  - Matched SavedProvider CUIDs:", eligibleSavedProviders.map(sp => sp.id));
    }

    if (eligibleSavedProviders.length === 0) {
      console.log("❌ No providers match the criteria");
      return NextResponse.json({ 
        error: "No providers are configured to accept this appointment type or match the filter criteria" 
      }, { status: 400 });
    }

    // STEP 3: Collect unique nexhealthProviderId values for NexHealth API
    const nexhealthProviderIds = [...new Set(
      eligibleSavedProviders.map(sp => sp.provider.nexhealthProviderId)
    )];

    console.log("🔗 NexHealth Provider IDs extracted:", nexhealthProviderIds);

    // CRUCIAL STEP C: Get operatories assigned to these eligible providers
    const eligibleOperatories: Array<{
      id: string;
      nexhealthOperatoryId: string;
      name: string;
    }> = [];

    for (const savedProvider of eligibleSavedProviders) {
      // Get operatories assigned to this provider
      const assignedOperatories = savedProvider.assignedOperatories.map(assignment => assignment.savedOperatory);
      eligibleOperatories.push(...assignedOperatories);
    }

    // Remove duplicates
    const uniqueOperatories = eligibleOperatories.filter((operatory, index, self) => 
      index === self.findIndex(o => o.id === operatory.id)
    );

    console.log("🏢 Operatory derivation - Step 1 (From eligible providers):");
    console.log("  - Operatories derived from eligible providers:", uniqueOperatories.length);
    console.log("  - Operatory details:", uniqueOperatories.map(op => ({
      operatoryId: op.id,
      name: op.name,
      nexhealthOperatoryId: op.nexhealthOperatoryId
    })));

    // STEP 5: Apply optional operatory filter (if operatoryIds provided, filter by SavedOperatory.id)
    let finalOperatories = uniqueOperatories;
    if (operatoryIds.length > 0) {
      const beforeFilterCount = finalOperatories.length;
      finalOperatories = uniqueOperatories.filter(operatory => 
        operatoryIds.includes(operatory.id)
      );
      console.log("🏢 Operatory derivation - Step 2 (Optional operatory filter):");
      console.log("  - Before operatory filter:", beforeFilterCount);
      console.log("  - After operatory filter:", finalOperatories.length);
      console.log("  - Operatory filter CUIDs from frontend:", operatoryIds);
      console.log("  - Matched operatory CUIDs:", finalOperatories.map(op => op.id));
    }

    // CRUCIAL STEP D: Extract nexhealthOperatoryIds for the API call
    const nexhealthOperatoryIds = finalOperatories.map(operatory => operatory.nexhealthOperatoryId);

    console.log("🔗 NexHealth Operatory IDs extracted:", nexhealthOperatoryIds);

    // STEP 7: Build NexHealth API parameters with correct requirements
    const params: Record<string, string | number | string[]> = {
      start_date: requestedDate,
      days: daysToSearch,
      'lids[]': [practice.nexhealthLocationId],
      'pids[]': nexhealthProviderIds,
      slot_length: appointmentType.duration, // CRITICAL: Use duration from Laine AppointmentType, NOT appointment_type_id
      overlapping_operatory_slots: 'false' // CRITICAL: Explicitly set to false as string
    };

    // Add operatory IDs if we have any
    if (nexhealthOperatoryIds.length > 0) {
      params['operatory_ids[]'] = nexhealthOperatoryIds;
    }

    // CRITICAL: Log the exact params being sent to NexHealth API
    console.log("🚀 NEXHEALTH API CALL PARAMETERS:");
    console.log("  - Endpoint: /appointment_slots");
    console.log("  - Subdomain:", practice.nexhealthSubdomain);
    console.log("  - Params:", JSON.stringify(params, null, 2));
    console.log("  - IMPORTANT: slot_length =", appointmentType.duration, "(from AppointmentType.duration)");
    console.log("  - IMPORTANT: overlapping_operatory_slots = 'false'");
    console.log("  - IMPORTANT: NO appointment_type_id parameter sent to NexHealth");

    // STEP 8: Call NexHealth API
    const slotsResponse = await fetchNexhealthAPI(
      '/appointment_slots',
      practice.nexhealthSubdomain,
      params
    );

    console.log("📡 NexHealth API Response received");

    // STEP 9: Parse response and extract slots
    const rawSlots: Array<NexhealthSlot & { provider_id: number; location_id: number }> = [];
    
    if (slotsResponse?.data && Array.isArray(slotsResponse.data)) {
      // Extract all slots from all providers
      for (const providerData of slotsResponse.data) {
        if (providerData.slots && Array.isArray(providerData.slots)) {
          rawSlots.push(...providerData.slots.map((slot: NexhealthSlot) => ({
            ...slot,
            provider_id: providerData.pid,
            location_id: providerData.lid
          })));
        }
      }
    }

    console.log("📊 Slot processing:");
    console.log("  - Raw slots from NexHealth API:", rawSlots.length);

    // STEP 10: Filter out lunch break slots (1-2 PM local time)
    const filteredSlots = rawSlots.filter(slot => !isLunchBreakSlot(slot.time));

    console.log("  - Slots after lunch break filtering:", filteredSlots.length);
    console.log("  - Lunch break slots filtered out:", rawSlots.length - filteredSlots.length);

    // Create provider lookup map
    const providerLookup = new Map();
    eligibleSavedProviders.forEach(sp => {
      providerLookup.set(sp.provider.nexhealthProviderId, {
        id: sp.provider.id,
        nexhealthProviderId: sp.provider.nexhealthProviderId,
        name: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim()
      });
    });

    // Create operatory lookup map
    const operatoryLookup = new Map();
    finalOperatories.forEach(operatory => {
      operatoryLookup.set(operatory.nexhealthOperatoryId, {
        id: operatory.id,
        nexhealthOperatoryId: operatory.nexhealthOperatoryId,
        name: operatory.name
      });
    });

    // STEP 11: Format slots for display with enhanced information
    const formattedSlots = filteredSlots.map((slot, index) => {
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

    console.log("✅ Final result:", formattedSlots.length, "formatted slots ready to return");
    console.log("=== CHECK SLOTS API - COMPLETED ===");

    return NextResponse.json({
      success: true,
      data: {
        requested_date: requestedDate,
        appointment_type: {
          id: appointmentType.id, // Return Laine CUID
          nexhealthAppointmentTypeId: appointmentType.nexhealthAppointmentTypeId, // Also include for reference
          name: appointmentType.name,
          duration: appointmentType.duration
        },
        available_slots: formattedSlots,
        has_availability: formattedSlots.length > 0,
        total_slots_found: formattedSlots.length,
        debug_info: {
          slot_length_used: appointmentType.duration,
          overlapping_operatory_slots_param: 'false',
          raw_slots_before_lunch_filter: rawSlots.length,
          slots_after_lunch_filter: filteredSlots.length,
          lunch_break_slots_filtered: rawSlots.length - filteredSlots.length,
          providers_checked: eligibleSavedProviders.length,
          operatories_checked: finalOperatories.length,
          providers_used: eligibleSavedProviders.map(sp => ({
            id: sp.provider.id,
            name: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim(),
            nexhealthProviderId: sp.provider.nexhealthProviderId,
            acceptedAppointmentTypesCount: sp.acceptedAppointmentTypes.length
          })),
          operatories_used: finalOperatories.map(operatory => ({
            id: operatory.id,
            name: operatory.name,
            nexhealthOperatoryId: operatory.nexhealthOperatoryId
          }))
        }
      }
    });

  } catch (error) {
    console.error("❌ Error checking appointment slots:", error);
    return NextResponse.json(
      { 
        error: "Failed to check appointment slots", 
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 