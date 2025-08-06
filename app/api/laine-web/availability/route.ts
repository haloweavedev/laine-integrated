import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface NexhealthSlot {
  time: string;
  end_time: string;
  operatory_id: number;
}

interface NexhealthProvider {
  lid: number;
  pid: number;
  slots: NexhealthSlot[];
}

interface NexhealthResponse {
  code: boolean;
  data: NexhealthProvider[];
  error?: string;
}

interface ProcessedSlot {
  time: string;
  end_time: string;
  operatory_id: number;
  pid: number;
  lid: number;
}

interface BucketedDay {
  date: string;
  morning: ProcessedSlot[];
  afternoon: ProcessedSlot[];
  evening: ProcessedSlot[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { practiceId, nexhealthAppointmentTypeId, mode } = body;

    if (!practiceId || !nexhealthAppointmentTypeId || !mode) {
      return NextResponse.json(
        { error: 'practiceId, nexhealthAppointmentTypeId, and mode are required' },
        { status: 400 }
      );
    }

    if (!['first', 'fullday'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be either "first" or "fullday"' },
        { status: 400 }
      );
    }

    console.log(`[Availability API] Fetching availability for appointment type ${nexhealthAppointmentTypeId} in ${mode} mode`);

    // Step 1: Find the appointment type and get provider/operatory configuration
    // This mirrors the logic from scripts/check-appointment-dependencies.js
    const appointmentType = await prisma.appointmentType.findFirst({
      where: { 
        nexhealthAppointmentTypeId: nexhealthAppointmentTypeId 
      },
      include: {
        practice: true,
        acceptedByProviders: {
          include: {
            savedProvider: {
              include: {
                provider: true,
                assignedOperatories: {
                  include: {
                    savedOperatory: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!appointmentType) {
      return NextResponse.json(
        { error: 'Appointment type not found' },
        { status: 404 }
      );
    }

    // Step 2: Collect active providers and operatories
    const activeProviders = appointmentType.acceptedByProviders.filter(ap => ap.savedProvider.isActive);
    
    if (activeProviders.length === 0) {
      return NextResponse.json(
        { error: 'No active providers available for this appointment type' },
        { status: 400 }
      );
    }

    // Collect unique provider IDs (pids)
    const pids = Array.from(new Set(
      activeProviders.map(ap => ap.savedProvider.provider.nexhealthProviderId)
    )).filter(pid => pid); // Remove any null/undefined values

    // Collect unique operatory IDs (oids) from active operatories
    const oids = Array.from(new Set(
      activeProviders.flatMap(ap => 
        ap.savedProvider.assignedOperatories
          .filter(ao => ao.savedOperatory.isActive)
          .map(ao => ao.savedOperatory.nexhealthOperatoryId)
      )
    )).filter(oid => oid); // Remove any null/undefined values

    if (pids.length === 0 || oids.length === 0) {
      return NextResponse.json(
        { error: 'No active providers or operatories are configured for this appointment type' },
        { status: 400 }
      );
    }

    console.log(`[Availability API] Found ${pids.length} providers and ${oids.length} operatories`);

    // Step 3: Get practice NexHealth configuration
    const practice = appointmentType.practice;
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json(
        { error: 'Practice NexHealth configuration is incomplete' },
        { status: 400 }
      );
    }

    // Step 4: Build NexHealth API request
    const baseUrl = 'https://nexhealth.info/appointment_slots';
    const params = new URLSearchParams();
    
    params.append('subdomain', practice.nexhealthSubdomain);
    params.append('lids[]', practice.nexhealthLocationId);
    params.append('slot_length', appointmentType.duration.toString());
    params.append('overlapping_operatory_slots', 'false');
    
    // Add provider IDs
    pids.forEach(pid => params.append('pids[]', pid));

    // Add operatory IDs
    oids.forEach(oid => params.append('operatory_ids[]', oid));

    // Set date range based on mode
    const today = new Date().toISOString().split('T')[0];
    if (mode === 'first') {
      params.append('limit', '1');
      params.append('start_date', today);
      params.append('days', '7'); // Search next 7 days for first slot
    } else {
      params.append('start_date', today);
      params.append('days', '7');
    }

    const nexhealthUrl = `${baseUrl}?${params.toString()}`;
    console.log(`[Availability API] Calling NexHealth: ${nexhealthUrl}`);

    const apiToken = process.env.NEXHEALTH_API_KEY;
    if (!apiToken) {
      console.error('[Availability API] Critical Error: NEXHEALTH_API_KEY is not set in the environment.');
      return NextResponse.json(
        { error: 'Server configuration error: Missing API token.' },
        { status: 500 }
      );
    }
    console.log('[Availability API] API Token found. Proceeding to call NexHealth.');

    // Step 5: Call NexHealth API
    const nexhealthResponse = await fetch(nexhealthUrl, {
      headers: {
        'Authorization': apiToken,
        'accept': 'application/vnd.Nexhealth+json;version=2'
      }
    });

    const responseText = await nexhealthResponse.text();
    console.log('[Availability API] Raw NexHealth Response:', responseText);

    if (!nexhealthResponse.ok) {
      console.error(`[Availability API] NexHealth API error: ${nexhealthResponse.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch availability from NexHealth' },
        { status: 500 }
      );
    }

    const nexhealthData: NexhealthResponse = JSON.parse(responseText);

    if (!nexhealthData.code || !nexhealthData.data) {
      console.error('[Availability API] Invalid NexHealth response:', nexhealthData);
      return NextResponse.json(
        { error: nexhealthData.error || 'Invalid response from NexHealth' },
        { status: 500 }
      );
    }

    // Step 6: Process the response based on mode
    const allSlots: ProcessedSlot[] = nexhealthData.data
      .flatMap(provider => 
        provider.slots.map(slot => ({
          time: slot.time,
          end_time: slot.end_time,
          operatory_id: slot.operatory_id,
          pid: provider.pid,
          lid: provider.lid
        }))
      )
      .filter(slot => {
        // Exclude slots that start during the 13:00 hour (1 PM - 1:59 PM)
        const slotHour = new Date(slot.time).getHours();
        return slotHour !== 13;
      });

    console.log(`[Availability API] Found ${allSlots.length} total slots`);

    if (mode === 'first') {
      // Return just the first slot
      const firstSlot = allSlots[0] || null;
      return NextResponse.json({
        success: true,
        mode: 'first',
        firstSlot,
        appointmentType: {
          name: appointmentType.name,
          duration: appointmentType.duration
        }
      });
    }

    // For fullday mode, bucket slots into morning/afternoon/evening for each day
    const bucketedDays: Record<string, BucketedDay> = {};

    allSlots.forEach(slot => {
      const slotDate = new Date(slot.time);
      const dateKey = slotDate.toISOString().split('T')[0];
      const hour = slotDate.getHours();

      if (!bucketedDays[dateKey]) {
        bucketedDays[dateKey] = {
          date: dateKey,
          morning: [],
          afternoon: [],
          evening: []
        };
      }

      if (hour < 12) {
        bucketedDays[dateKey].morning.push(slot);
      } else if (hour < 17) {
        bucketedDays[dateKey].afternoon.push(slot);
      } else {
        bucketedDays[dateKey].evening.push(slot);
      }
    });

    // Convert to array and sort by date
    const sortedDays = Object.values(bucketedDays).sort((a, b) => 
      a.date.localeCompare(b.date)
    );

    return NextResponse.json({
      success: true,
      mode: 'fullday',
      days: sortedDays,
      appointmentType: {
        name: appointmentType.name,
        duration: appointmentType.duration
      },
      totalSlots: allSlots.length
    });

  } catch (error) {
    console.error('[Availability API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error while fetching availability' },
      { status: 500 }
    );
  }
}