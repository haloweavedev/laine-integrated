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

interface NexhealthProviderData {
  pid: number;
  lid: number;
  slots?: NexhealthSlot[];
  [key: string]: unknown;
}

interface NexhealthSlotsResponse {
  data?: NexhealthProviderData[];
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
        error: "Practice configuration missing. Please set up NexHealth subdomain and location ID." 
      }, { status: 400 });
    }

    const { appointmentTypeId, requestedDate, days = 1 } = await req.json();

    // Validate required fields
    if (!appointmentTypeId || !requestedDate) {
      return NextResponse.json({ 
        error: "Missing required fields: appointmentTypeId, requestedDate" 
      }, { status: 400 });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return NextResponse.json({ 
        error: "Date must be in YYYY-MM-DD format" 
      }, { status: 400 });
    }

    // Validate appointment type belongs to practice
    const appointmentType = practice.appointmentTypes.find(
      (at) => at.nexhealthAppointmentTypeId === appointmentTypeId
    );

    if (!appointmentType) {
      return NextResponse.json({ 
        error: "Appointment type not found or doesn't belong to practice" 
      }, { status: 400 });
    }

    // Check if practice has active providers
    const activeProviders = practice.savedProviders.filter((sp) => sp.isActive);
    const activeOperatories = practice.savedOperatories.filter((so) => so.isActive);

    if (activeProviders.length === 0) {
      return NextResponse.json({ 
        error: "No providers are currently configured for scheduling" 
      }, { status: 400 });
    }

    // Get provider and operatory arrays
    const providers = activeProviders.map(sp => sp.provider.nexhealthProviderId);
    const operatories = activeOperatories.map(so => so.nexhealthOperatoryId);

    // Build search params object for NexHealth API
    const searchParams: Record<string, string | string[]> = {
      start_date: requestedDate,
      days: days.toString(),
      appointment_type_id: appointmentTypeId,
      'lids[]': [practice.nexhealthLocationId],
      'pids[]': providers
    };

    // Add operatory IDs if configured
    if (operatories.length > 0) {
      searchParams['operatory_ids[]'] = operatories;
    }

    console.log(`[check-slots] Checking ${requestedDate} for appointment type ${appointmentTypeId}`);

    const slotsResponse = await fetchNexhealthAPI(
      '/appointment_slots',
      practice.nexhealthSubdomain,
      searchParams
    ) as NexhealthSlotsResponse;

    console.log(`[check-slots] API response:`, JSON.stringify(slotsResponse, null, 2));

    // Parse response and extract slots
    const availableSlots: Array<NexhealthSlot & { provider_id: number; location_id: number }> = [];
    
    if (slotsResponse?.data && Array.isArray(slotsResponse.data)) {
      // Extract all slots from all providers
      for (const providerData of slotsResponse.data) {
        if (providerData.slots && Array.isArray(providerData.slots)) {
          availableSlots.push(...providerData.slots.map((slot) => ({
            ...slot,
            provider_id: providerData.pid,
            location_id: providerData.lid
          })));
        }
      }
    }

    // Format slots for display
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
      
      return {
        slot_id: `slot_${index}`,
        time: slot.time,
        end_time: slot.end_time,
        display_time: timeString,
        display_end_time: endTimeString,
        display_range: `${timeString} - ${endTimeString}`,
        operatory_id: slot.operatory_id,
        provider_id: slot.provider_id,
        location_id: slot.location_id
      };
    });

    // Sort slots by time
    formattedSlots.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return NextResponse.json({
      success: true,
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
          providers_checked: providers.length,
          operatories_checked: operatories.length
        }
      }
    });

  } catch (error) {
    console.error("Error checking appointment slots:", error);
    return NextResponse.json(
      { error: "Failed to check appointment slots" },
      { status: 500 }
    );
  }
} 