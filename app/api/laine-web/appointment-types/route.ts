import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const practiceId = searchParams.get('practiceId');
    const patientStatus = searchParams.get('patientStatus');

    // Validate required parameters
    if (!practiceId) {
      return NextResponse.json(
        { error: 'Practice ID is required' },
        { status: 400 }
      );
    }

    if (!patientStatus || !['NEW', 'RETURNING'].includes(patientStatus)) {
      return NextResponse.json(
        { error: 'Valid patient status (NEW or RETURNING) is required' },
        { status: 400 }
      );
    }

    // Query appointment types filtered by practice, bookable online, and patient status
    const appointmentTypes = await prisma.appointmentType.findMany({
      where: {
        practiceId: practiceId,
        bookableOnline: true,
        webPatientStatus: {
          in: [patientStatus as 'NEW' | 'RETURNING', 'BOTH'] // Include appointment types for specific status or BOTH
        }
      },
      select: {
        id: true,
        nexhealthAppointmentTypeId: true,
        name: true,
        duration: true,
        spokenName: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    console.log(`[Laine Web API] Found ${appointmentTypes.length} appointment types for practice ${practiceId} and patient status ${patientStatus}`);

    return NextResponse.json({
      success: true,
      appointmentTypes
    });

  } catch (error) {
    console.error('[Laine Web API] Error fetching appointment types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointment types' },
      { status: 500 }
    );
  }
} 