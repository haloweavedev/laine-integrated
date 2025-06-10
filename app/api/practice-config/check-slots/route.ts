import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

interface NexhealthSlot {
  time: string;
  end_time: string;
  operatory_id?: number;
  [key: string]: unknown;
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
        savedProviders: {
          include: {
            provider: true
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

    const {
      requestedDate,
      appointmentTypeId,
      providerIds,
      operatoryIds,
      daysToSearch = 1
    } = await req.json();

    // Validate required fields
    if (!requestedDate || !appointmentTypeId || !providerIds || !Array.isArray(providerIds)) {
      return NextResponse.json({ 
        error: "Missing required fields: requestedDate, appointmentTypeId, providerIds (array)" 
      }, { status: 400 });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(requestedDate)) {
      return NextResponse.json({ 
        error: "requestedDate must be in YYYY-MM-DD format" 
      }, { status: 400 });
    }

    // Validate daysToSearch is a positive number
    if (typeof daysToSearch !== 'number' || daysToSearch < 1 || daysToSearch > 30) {
      return NextResponse.json({ 
        error: "daysToSearch must be a number between 1 and 30" 
      }, { status: 400 });
    }

    // Validate appointment type belongs to practice
    const appointmentType = practice.appointmentTypes.find(
      at => at.nexhealthAppointmentTypeId === appointmentTypeId
    );

    if (!appointmentType) {
      return NextResponse.json({ 
        error: "Appointment type not found or doesn't belong to practice" 
      }, { status: 400 });
    }

    // Filter providers based on selection or use all active
    let activeProviders = practice.savedProviders.filter(sp => sp.isActive);
    if (providerIds.length > 0) {
      activeProviders = activeProviders.filter(sp => providerIds.includes(sp.provider.id));
    }

    // Filter operatories based on selection or use all active
    let activeOperatories = practice.savedOperatories.filter(so => so.isActive);
    if (operatoryIds && Array.isArray(operatoryIds) && operatoryIds.length > 0) {
      activeOperatories = activeOperatories.filter(so => operatoryIds.includes(so.id));
    }

    if (activeProviders.length === 0) {
      return NextResponse.json({ 
        error: "No providers are currently configured for scheduling" 
      }, { status: 400 });
    }

    // Get provider arrays
    const providers = activeProviders.map(sp => sp.provider.nexhealthProviderId);

    // Build NexHealth API parameters
    const params: Record<string, string | number | string[]> = {
      start_date: requestedDate,
      days: daysToSearch,
      'lids[]': [practice.nexhealthLocationId],
      'pids[]': providers,
      appointment_type_id: appointmentTypeId
    };

    // Add operatory IDs if provided
    if (operatoryIds && Array.isArray(operatoryIds) && operatoryIds.length > 0) {
      params['operatory_ids[]'] = operatoryIds;
    }

    console.log("Checking appointment slots with params:", params);

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
    activeProviders.forEach(sp => {
      providerLookup.set(sp.provider.nexhealthProviderId, {
        id: sp.provider.id,
        nexhealthProviderId: sp.provider.nexhealthProviderId,
        name: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim()
      });
    });

    // Create operatory lookup map
    const operatoryLookup = new Map();
    activeOperatories.forEach(so => {
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
          duration: appointmentType.duration
        },
        available_slots: formattedSlots,
        has_availability: formattedSlots.length > 0,
        total_slots_found: formattedSlots.length,
        debug_info: {
          providers_checked: activeProviders.length,
          operatories_checked: activeOperatories.length,
          providers_used: activeProviders.map(sp => ({
            id: sp.provider.id,
            name: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim(),
            nexhealthProviderId: sp.provider.nexhealthProviderId
          })),
          operatories_used: activeOperatories.map(so => ({
            id: so.id,
            name: so.name,
            nexhealthOperatoryId: so.nexhealthOperatoryId
          }))
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