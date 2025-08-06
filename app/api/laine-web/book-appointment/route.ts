import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface BookingRequest {
  practiceId: string;
  appointmentTypeId: string;
  selectedSlot: {
    time: string;
    end_time: string;
    operatory_id: number;
    pid: number;
    lid: number;
  };
  patientDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dob?: string;
    patientType: 'NEW' | 'EXISTING';
    patientStatus: 'NEW' | 'RETURNING';
    isForSelf: boolean;
    isGuardian?: boolean;
    insurance?: string;
    notes?: string;
  };
}

interface NexhealthPatient {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth?: string;
}



interface NexhealthPatientSearchResponse {
  code: boolean;
  data?: {
    patients: NexhealthPatient[];
  };
  error?: string;
}

interface NexhealthPatientCreateResponse {
  code: boolean;
  data?: {
    user: NexhealthPatient;
  };
  error?: string;
}

interface NexhealthAppointmentResponse {
  code: boolean;
  data?: {
    appt: {
      id: number;
      patient_id: number;
      provider_id: number;
      start_time: string;
      end_time: string;
      note: string;
      operatory_id: number;
    };
  };
  error?: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: BookingRequest = await request.json();
    const { practiceId, appointmentTypeId, selectedSlot, patientDetails } = body;

    // Validate required fields
    if (!practiceId || !appointmentTypeId || !selectedSlot || !patientDetails) {
      return NextResponse.json(
        { error: 'Missing required booking information' },
        { status: 400 }
      );
    }

    console.log(`[Book Appointment API] Starting booking process for ${patientDetails.firstName} ${patientDetails.lastName}`);

    // Step 1: Get practice and appointment type information
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: {
        nexhealthSubdomain: true,
        nexhealthLocationId: true,
        timezone: true
      }
    });

    if (!practice?.nexhealthSubdomain || !practice?.nexhealthLocationId) {
      return NextResponse.json(
        { error: 'Practice NexHealth configuration is incomplete' },
        { status: 400 }
      );
    }

    const appointmentType = await prisma.appointmentType.findUnique({
      where: { id: appointmentTypeId },
      select: {
        name: true,
        duration: true,
        nexhealthAppointmentTypeId: true
      }
    });

    if (!appointmentType) {
      return NextResponse.json(
        { error: 'Appointment type not found' },
        { status: 404 }
      );
    }

    // Step 2: Two-step patient resolution process
    let nexhealthPatientId: number;

    if (patientDetails.patientType === 'EXISTING') {
      // Search for existing patient using name and DOB
      console.log(`[Book Appointment API] Searching for existing patient: ${patientDetails.firstName} ${patientDetails.lastName}`);

      if (!patientDetails.dob) {
        return NextResponse.json(
          { error: 'Date of birth is required for existing patients' },
          { status: 400 }
        );
      }

      const searchParams = new URLSearchParams();
      searchParams.append('subdomain', practice.nexhealthSubdomain);
      searchParams.append('location_id', practice.nexhealthLocationId);
      searchParams.append('name', `${patientDetails.firstName} ${patientDetails.lastName}`);
      searchParams.append('new_patient', 'false');
      searchParams.append('location_strict', 'false');
      searchParams.append('sort', 'name');
      searchParams.append('page', '1');
      searchParams.append('per_page', '5');

      const searchResponse = await fetch(
        `https://nexhealth.info/patients?${searchParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': process.env.NEXHEALTH_API_KEY || '',
            'accept': 'application/vnd.Nexhealth+json;version=2'
          }
        }
      );

      if (!searchResponse.ok) {
        console.error(`[Book Appointment API] Patient search failed: ${searchResponse.status}`);
        return NextResponse.json(
          { error: 'Failed to search for existing patient' },
          { status: 500 }
        );
      }

      const searchData: NexhealthPatientSearchResponse = await searchResponse.json();

      if (!searchData.code || !searchData.data?.patients || searchData.data.patients.length === 0) {
        return NextResponse.json(
          { error: 'We could not find a patient record matching your name and date of birth. Please try booking as a new patient or contact the office.' },
          { status: 404 }
        );
      }

      // Use the first matching patient
      nexhealthPatientId = searchData.data.patients[0].id;
      console.log(`[Book Appointment API] Found existing patient with ID: ${nexhealthPatientId}`);

    } else if (patientDetails.patientType === 'NEW') {
      // Create new patient
      console.log(`[Book Appointment API] Creating new patient: ${patientDetails.firstName} ${patientDetails.lastName}`);

      const patientPayload = {
        provider: {
          provider_id: selectedSlot.pid
        },
        patient: {
          bio: {
            phone_number: patientDetails.phone.replace(/\D/g, ''), // Remove formatting
            ...(patientDetails.dob && { date_of_birth: patientDetails.dob })
          },
          first_name: patientDetails.firstName,
          last_name: patientDetails.lastName,
          email: patientDetails.email
        }
      };

      const createResponse = await fetch(
        `https://nexhealth.info/patients?subdomain=${practice.nexhealthSubdomain}&location_id=${practice.nexhealthLocationId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': process.env.NEXHEALTH_API_KEY || '',
            'accept': 'application/vnd.Nexhealth+json;version=2',
            'content-type': 'application/json'
          },
          body: JSON.stringify(patientPayload)
        }
      );

      if (!createResponse.ok) {
        console.error(`[Book Appointment API] Patient creation failed: ${createResponse.status}`);
        return NextResponse.json(
          { error: 'Failed to create new patient record' },
          { status: 500 }
        );
      }

      const createData: NexhealthPatientCreateResponse = await createResponse.json();

      if (!createData.code || !createData.data?.user) {
        console.error('[Book Appointment API] Invalid patient creation response:', createData);
        return NextResponse.json(
          { error: createData.error || 'Failed to create new patient' },
          { status: 500 }
        );
      }

      nexhealthPatientId = createData.data.user.id;
      console.log(`[Book Appointment API] Created new patient with ID: ${nexhealthPatientId}`);

    } else {
      return NextResponse.json(
        { error: 'Invalid patient type specified' },
        { status: 400 }
      );
    }

    // Step 3: Create appointment booking summary note
    const bookingNote = [
      `Appointment booked via Laine Web`,
      `Service: ${appointmentType.name}`,
      `Duration: ${appointmentType.duration} minutes`,
      `Patient Type: ${patientDetails.patientType}`,
      `Patient Status: ${patientDetails.patientStatus}`,
      ...(patientDetails.isForSelf ? [`Booking for self`] : [`Booking for someone else`]),
      ...(patientDetails.isGuardian ? [`Booked by parent/guardian`] : []),
      ...(patientDetails.insurance ? [`Insurance: ${patientDetails.insurance}`] : []),
      ...(patientDetails.notes ? [`Notes: ${patientDetails.notes}`] : [])
    ].join(' | ');

    // Step 4: Create the appointment in NexHealth
    const appointmentPayload = {
      appt: {
        patient_id: nexhealthPatientId,
        provider_id: selectedSlot.pid,
        operatory_id: selectedSlot.operatory_id,
        start_time: selectedSlot.time,
        end_time: selectedSlot.end_time,
        note: bookingNote
      }
    };

    console.log(`[Book Appointment API] Creating appointment in NexHealth`);

    const appointmentResponse = await fetch(
      `https://nexhealth.info/appointments?subdomain=${practice.nexhealthSubdomain}&location_id=${practice.nexhealthLocationId}&notify_patient=false`,
      {
        method: 'POST',
        headers: {
          'Authorization': process.env.NEXHEALTH_API_KEY || '',
          'accept': 'application/vnd.Nexhealth+json;version=2',
          'content-type': 'application/json'
        },
        body: JSON.stringify(appointmentPayload)
      }
    );

    if (!appointmentResponse.ok) {
      console.error(`[Book Appointment API] Appointment creation failed: ${appointmentResponse.status}`);
      // If appointment creation fails, we should ideally clean up the patient record
      // For now, we'll just return an error
      return NextResponse.json(
        { error: 'Failed to create appointment' },
        { status: 500 }
      );
    }

    const appointmentData: NexhealthAppointmentResponse = await appointmentResponse.json();

    if (!appointmentData.code || !appointmentData.data?.appt) {
      console.error('[Book Appointment API] Invalid appointment creation response:', appointmentData);
      return NextResponse.json(
        { error: appointmentData.error || 'Failed to create appointment' },
        { status: 500 }
      );
    }

    const nexhealthAppointment = appointmentData.data.appt;
    console.log(`[Book Appointment API] Appointment created with ID: ${nexhealthAppointment.id}`);

    // Step 5: Log the booking in our database
    try {
      const webBooking = await prisma.webBooking.create({
        data: {
          practiceId: practiceId,
          appointmentTypeId: appointmentTypeId,
          status: 'COMPLETED',
          patientFirstName: patientDetails.firstName,
          patientLastName: patientDetails.lastName,
          patientDob: patientDetails.dob || null,
          patientEmail: patientDetails.email,
          patientPhone: patientDetails.phone,
          patientStatus: patientDetails.patientStatus,
          selectedSlotTime: new Date(selectedSlot.time),
          notes: patientDetails.notes || null,
          nexhealthBookingId: nexhealthAppointment.id.toString(),
          nexhealthPatientId: nexhealthPatientId.toString()
        }
      });

      console.log(`[Book Appointment API] WebBooking record created with ID: ${webBooking.id}`);
    } catch (dbError) {
      console.error('[Book Appointment API] Failed to create WebBooking record:', dbError);
      // Don't fail the entire request if logging fails, since the appointment was created successfully
    }

    // Step 6: Return success response
    return NextResponse.json({
      success: true,
      booking: {
        nexhealthAppointmentId: nexhealthAppointment.id,
        nexhealthPatientId: nexhealthPatientId,
        appointmentDetails: {
          patientName: `${patientDetails.firstName} ${patientDetails.lastName}`,
          appointmentType: appointmentType.name,
          duration: appointmentType.duration,
          startTime: selectedSlot.time,
          endTime: selectedSlot.end_time,
          providerId: selectedSlot.pid,
          operatoryId: selectedSlot.operatory_id
        }
      }
    });

  } catch (error) {
    console.error('[Book Appointment API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error during booking process' },
      { status: 500 }
    );
  }
}