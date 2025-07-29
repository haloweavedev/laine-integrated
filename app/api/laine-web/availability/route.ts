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

    // Validate required parameters
    if (!practiceId) {
      return NextResponse.json(
        { error: 'Practice ID is required' },
        { status: 400 }
      );
    }

    if (!nexhealthAppointmentTypeId) {
      return NextResponse.json(
        { error: 'NexHealth Appointment Type ID is required' },
        { status: 400 }
      );
    }

    if (!startDate) {
      return NextResponse.json(
        { error: 'Start date is required' },
        { status: 400 }
      );
    }

    // Parse and validate searchDays (default to 60 for wide search)
    const searchDaysNum = searchDays ? parseInt(searchDays, 10) : 60;
    if (isNaN(searchDaysNum) || searchDaysNum < 1) {
      return NextResponse.json(
        { error: 'Search days must be a positive number' },
        { status: 400 }
      );
    }

    // Fetch practice details from database
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: {
        id: true,
        nexhealthSubdomain: true,
        nexhealthLocationId: true,
        timezone: true
      }
    });

    if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json(
        { error: 'Practice not found or not properly configured' },
        { status: 404 }
      );
    }

    console.log(`[Laine Web Availability] Searching for slots: practice=${practiceId}, nexhealthAppointmentTypeId=${nexhealthAppointmentTypeId}, startDate=${startDate}, searchDays=${searchDaysNum}`);

    // Call the existing findAvailableSlots function with nexhealthAppointmentTypeId directly
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
    console.error('[Laine Web Availability] Error fetching availability:', error);
    
    // Extract meaningful error message
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch availability';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 