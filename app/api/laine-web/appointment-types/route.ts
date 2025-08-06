import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { practiceId } = body;

    if (!practiceId) {
      return NextResponse.json(
        { error: 'Practice ID is required' },
        { status: 400 }
      );
    }

    // Fetch appointment types from the database
    // Filter by practiceId and where webPatientStatus is not null (meaning they're available for web booking)
    const appointmentTypes = await prisma.appointmentType.findMany({
      where: {
        practiceId: practiceId,
        // webPatientStatus has a default value, so we don't need to filter for null
        // Only include appointment types that have active providers accepting them
        acceptedByProviders: {
          some: {
            savedProvider: {
              isActive: true,
              // And those providers have active operatories
              assignedOperatories: {
                some: {
                  savedOperatory: {
                    isActive: true
                  }
                }
              }
            }
          }
        }
      },
      select: {
        id: true,
        nexhealthAppointmentTypeId: true,
        name: true,
        duration: true,
        spokenName: true,
        webPatientStatus: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    return NextResponse.json({
      success: true,
      appointmentTypes
    });

  } catch (error) {
    console.error('Error fetching appointment types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointment types' },
      { status: 500 }
    );
  }
}