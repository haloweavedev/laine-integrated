import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPatient, fetchNexhealthAPI } from '@/lib/nexhealth';
import { DateTime } from 'luxon';
import { Resend } from 'resend';
import AppointmentConfirmation from '@/emails/AppointmentConfirmation';
import type { CreatePatientArgs } from '@/lib/nexhealth';

interface BookingRequest {
  practice: {
    id: string;
    nexhealthSubdomain: string;
    nexhealthLocationId: string;
    timezone: string | null;
    name?: string | null;
    address?: string | null;
  };
  patient: {
    firstName: string;
    lastName: string;
    status: 'NEW' | 'RETURNING';
  };
  appointmentType: {
    id: string;
    nexhealthAppointmentTypeId: string;
    name: string;
    duration: number;
  };
  selectedSlot: {
    time: string;
    operatory_id?: number;
    providerId: number;
    locationId: number;
  };
  contactInfo: {
    email: string;
    phone: string;
    dob: string;
    notes: string;
  };
}

interface NexHealthPatient {
  id: number;
  first_name: string;
  last_name: string;
  bio?: {
    date_of_birth?: string;
  };
}

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const bookingData: BookingRequest = await req.json();
    
    // Validate required fields
    if (!bookingData.practice?.id || !bookingData.patient?.firstName || !bookingData.selectedSlot?.time) {
      return NextResponse.json(
        { error: 'Missing required booking information' },
        { status: 400 }
      );
    }

    console.log(`[Laine Web Booking] Starting booking process for ${bookingData.patient.firstName} ${bookingData.patient.lastName}`);

    // Get practice timezone
    const practiceTimezone = bookingData.practice.timezone || 'America/Chicago';
    let nexhealthPatientId: number;

    // Handle patient creation/lookup
    if (bookingData.patient.status === 'NEW') {
      console.log('[Laine Web Booking] Creating new patient');
      
      // Create new patient
      const patientArgs: CreatePatientArgs = {
        firstName: bookingData.patient.firstName,
        lastName: bookingData.patient.lastName,
        dateOfBirth: bookingData.contactInfo.dob,
        phoneNumber: bookingData.contactInfo.phone,
        email: bookingData.contactInfo.email
      };

      const { data: createPatientResponse } = await createPatient(
        patientArgs,
        bookingData.practice.nexhealthSubdomain,
        parseInt(bookingData.practice.nexhealthLocationId),
        bookingData.selectedSlot.providerId,
        [] // empty API log array
      );

      // Extract patient ID from response
      const responseData = createPatientResponse as { data?: { user?: { id?: number } }; user?: { id?: number } };
      const patientId = responseData?.data?.user?.id || responseData?.user?.id;
      
      if (!patientId) {
        console.error('[Laine Web Booking] Failed to extract patient ID from create response:', createPatientResponse);
        throw new Error('Failed to create patient record');
      }

      nexhealthPatientId = patientId;
      console.log(`[Laine Web Booking] Created new patient with ID: ${nexhealthPatientId}`);

    } else {
      console.log('[Laine Web Booking] Looking up returning patient');
      
      // Find existing patient
      const { data: searchResponse } = await fetchNexhealthAPI(
        '/patients',
        bookingData.practice.nexhealthSubdomain,
        { 
          location_id: bookingData.practice.nexhealthLocationId,
          name: `${bookingData.patient.firstName} ${bookingData.patient.lastName}`
        },
        'GET',
        undefined,
        [] // empty API log array
      );

      const response = searchResponse as { data?: { patients: NexHealthPatient[] } };
      const patients = response.data?.patients;

      if (!patients || patients.length === 0) {
        return NextResponse.json(
          { error: 'Patient record not found. Please verify your information or select "New Patient".' },
          { status: 404 }
        );
      }

      // Find patient with matching date of birth
      const matchedPatient = patients.find(patient => {
        const recordDob = patient.bio?.date_of_birth;
        return typeof recordDob === 'string' && recordDob.trim() === bookingData.contactInfo.dob.trim();
      });

      if (!matchedPatient) {
        return NextResponse.json(
          { error: 'No patient found with matching date of birth. Please verify your information or select "New Patient".' },
          { status: 404 }
        );
      }

      nexhealthPatientId = matchedPatient.id;
      console.log(`[Laine Web Booking] Found existing patient with ID: ${nexhealthPatientId}`);
    }

    // Create appointment booking
    console.log('[Laine Web Booking] Creating appointment');

    const startTimeLocal = DateTime.fromISO(bookingData.selectedSlot.time, { zone: practiceTimezone });
    const endTimeLocal = startTimeLocal.plus({ minutes: bookingData.appointmentType.duration });

    const appointmentPayload = {
      appt: {
        patient_id: nexhealthPatientId,
        provider_id: bookingData.selectedSlot.providerId,
        operatory_id: bookingData.selectedSlot.operatory_id || 0,
        start_time: startTimeLocal.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
        end_time: endTimeLocal.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
        note: bookingData.contactInfo.notes || `Web booking for ${bookingData.appointmentType.name}`
      }
    };

    console.log('[Laine Web Booking] Appointment payload:', appointmentPayload);

    const { data: appointmentResponse } = await fetchNexhealthAPI(
      '/appointments',
      bookingData.practice.nexhealthSubdomain,
      { location_id: bookingData.practice.nexhealthLocationId },
      'POST',
      appointmentPayload,
      [] // empty API log array
    );

    console.log('[Laine Web Booking] Appointment created successfully:', appointmentResponse);

    // Send confirmation email
    try {
      const formattedDateTime = DateTime.fromISO(bookingData.selectedSlot.time, { zone: practiceTimezone })
        .toFormat('cccc, MMMM d, yyyy \'at\' h:mm a');

      await resend.emails.send({
        from: 'Laine <scheduling@laine.dental>', // Replace with your actual domain
        to: [bookingData.contactInfo.email],
        subject: `Appointment Confirmed: ${bookingData.appointmentType.name} at ${bookingData.practice.name || 'Your Practice'}`,
        react: AppointmentConfirmation({
          patientName: `${bookingData.patient.firstName} ${bookingData.patient.lastName}`,
          appointmentType: bookingData.appointmentType.name,
          appointmentDate: formattedDateTime,
          practiceName: bookingData.practice.name || 'Your Practice',
          practiceAddress: bookingData.practice.address || undefined
        }),
      });

      console.log('[Laine Web Booking] Confirmation email sent successfully');
    } catch (emailError) {
      console.error('[Laine Web Booking] Failed to send confirmation email:', emailError);
      // Don't fail the entire booking if email fails
    }

    // Log the booking in our WebBooking table
    try {
      await prisma.webBooking.create({
        data: {
          practiceId: bookingData.practice.id,
          appointmentTypeId: bookingData.appointmentType.id,
          status: 'COMPLETED',
          patientFirstName: bookingData.patient.firstName,
          patientLastName: bookingData.patient.lastName,
          patientDob: bookingData.contactInfo.dob,
          patientEmail: bookingData.contactInfo.email,
          patientPhone: bookingData.contactInfo.phone,
          patientStatus: bookingData.patient.status,
          selectedSlotTime: new Date(bookingData.selectedSlot.time),
          notes: bookingData.contactInfo.notes,
          nexhealthBookingId: (appointmentResponse as { id?: number })?.id?.toString()
        }
      });

      console.log('[Laine Web Booking] Booking logged to database');
    } catch (dbError) {
      console.error('[Laine Web Booking] Failed to log booking to database:', dbError);
      // Don't fail the entire booking if database logging fails
    }

    // Format confirmation details
    const confirmationTime = DateTime.fromISO(bookingData.selectedSlot.time, { zone: practiceTimezone });
    
    return NextResponse.json({
      success: true,
      message: 'Booking confirmed successfully!',
      booking: {
        appointmentType: bookingData.appointmentType.name,
        date: confirmationTime.toFormat('cccc, MMMM d'),
        time: confirmationTime.toFormat('h:mm a'),
        patientName: `${bookingData.patient.firstName} ${bookingData.patient.lastName}`,
        nexhealthAppointmentId: (appointmentResponse as { id?: number })?.id
      }
    });

  } catch (error) {
    console.error('[Laine Web Booking] Booking failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Booking failed due to an unexpected error';
    
    // Check for specific error types
    if (errorMessage.toLowerCase().includes('slot is not available') || 
        errorMessage.toLowerCase().includes('already booked')) {
      return NextResponse.json(
        { error: 'SlotConflict', message: 'This time slot is no longer available.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 