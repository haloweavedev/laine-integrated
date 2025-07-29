import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Check authentication
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find the practice associated with this user
    const practice = await prisma.practice.findUnique({
      where: {
        clerkUserId: userId
      }
    });

    if (!practice) {
      return NextResponse.json(
        { error: 'Practice not found' },
        { status: 404 }
      );
    }

    // Fetch all web bookings for this practice
    // TODO: Fix Prisma client issue - may need to run migrations
    const webBookings: Array<{
      id: string;
      patientFirstName: string;
      patientLastName: string;
      patientEmail: string;
      patientPhone: string;
      selectedSlotTime: Date;
      appointmentType: { name: string };
      createdAt: Date;
    }> = []; // Temporary placeholder
    /*
    const webBookings = await prisma.webBooking.findMany({
      where: {
        practiceId: practice.id
      },
      include: {
        appointmentType: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    */

    return NextResponse.json({
      success: true,
      bookings: webBookings
    });

  } catch (error) {
    console.error('[Laine Web Appointments API] Error fetching appointments:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
} 