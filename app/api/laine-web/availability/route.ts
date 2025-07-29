import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findAvailableSlots } from '@/lib/ai/slotHelper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const practiceId = searchParams.get('practiceId');
    const nexhealthAppointmentTypeId = searchParams.get('nexhealthAppointmentTypeId');
    const startDate = searchParams.get('startDate');
    const searchDays = searchParams.get('searchDays');

    // --- Validation ---
    if (!practiceId || !nexhealthAppointmentTypeId || !startDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    const searchDaysNum = searchDays ? parseInt(searchDays, 10) : 90;

    if (isNaN(searchDaysNum) || searchDaysNum < 1) {
      return NextResponse.json(
        { error: 'Search days must be a positive number' },
        { status: 400 }
      );
    }

    // --- Fetch Practice Details ---
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { id: true, nexhealthSubdomain: true, nexhealthLocationId: true, timezone: true }
    });

    if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json({ error: 'Practice not found or not configured' }, { status: 404 });
    }

    console.log(`[Laine Web Availability] Delegating to findAvailableSlots: practice=${practiceId}, appointmentType=${nexhealthAppointmentTypeId}, searchDays=${searchDaysNum}`);

    // --- Delegate to the Single Source of Truth ---
    // This function will internally call getSlotSearchParams to get the correct
    // providers, operatories, and duration for this specific appointment type
    const result = await findAvailableSlots(
      nexhealthAppointmentTypeId,
      {
        id: practice.id,
        nexhealthSubdomain: practice.nexhealthSubdomain,
        nexhealthLocationId: practice.nexhealthLocationId,
        timezone: practice.timezone || 'America/Chicago'
      },
      startDate,
      searchDaysNum
    );

    console.log(`[Laine Web Availability] Found ${result.foundSlots.length} slots, next available: ${result.nextAvailableDate}`);

    return NextResponse.json({
      success: true,
      foundSlots: result.foundSlots,
      nextAvailableDate: result.nextAvailableDate
    });

  } catch (error) {
    console.error('[Laine Web Availability API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch availability';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 