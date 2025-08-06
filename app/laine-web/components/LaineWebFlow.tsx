"use client";

import { useState, useEffect } from 'react';
import { AppointmentTypeStep } from './AppointmentTypeStep';
import { AvailabilityStep } from './AvailabilityStep';
import { PatientDetailsStep } from './PatientDetailsStep';
import { ConfirmationStep } from './ConfirmationStep';

interface Practice {
  id: string;
  name: string | null;
  slug: string;
  timezone: string | null;
  nexhealthSubdomain: string;
  nexhealthLocationId: string;
}

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  spokenName: string | null;
  webPatientStatus: string;
}

interface SelectedSlot {
  time: string;
  end_time: string;
  operatory_id: number;
  pid: number; // provider id from NexHealth
  lid: number; // location id from NexHealth
}

interface PatientDetails {
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
}

interface BookingDetails {
  nexhealthAppointmentId: number;
  nexhealthPatientId: number;
  appointmentDetails: {
    patientName: string;
    appointmentType: string;
    duration: number;
    startTime: string;
    endTime: string;
    providerId: number;
    operatoryId: number;
  };
}

interface LaineWebFlowProps {
  practice: Practice;
}

export function LaineWebFlow({ practice }: LaineWebFlowProps) {
  const [step, setStep] = useState(1);
  const [appointmentType, setAppointmentType] = useState<AppointmentType | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null);
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectAppointmentType = (type: AppointmentType) => {
    setAppointmentType(type);
    setError(null);
    setStep(2);
  };

  const handleSelectSlot = (slot: SelectedSlot) => {
    setSelectedSlot(slot);
    setError(null);
    setStep(3);
  };

  const handlePatientDetailsSubmit = (details: PatientDetails) => {
    setPatientDetails(details);
    setError(null);
    setStep(4); // This will trigger the booking process via useEffect
  };

  // Handle booking when step 4 is reached
  useEffect(() => {
    if (step === 4 && appointmentType && selectedSlot && patientDetails && !isSubmitting && !bookingDetails) {
      handleBookingSubmission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, appointmentType, selectedSlot, patientDetails, isSubmitting, bookingDetails]);

  const handleBookingSubmission = async () => {
    if (!appointmentType || !selectedSlot || !patientDetails) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch('/api/laine-web/book-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          practiceId: practice.id,
          appointmentTypeId: appointmentType.id,
          selectedSlot,
          patientDetails
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to book appointment');
      }

      const data = await response.json();
      setBookingDetails(data.booking);
      setStep(5); // Move to confirmation step
    } catch (error) {
      console.error('Error booking appointment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to book appointment';
      setError(errorMessage);
      // Stay on step 4 to show the error
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScheduleAnother = () => {
    setStep(1);
    setAppointmentType(null);
    setSelectedSlot(null);
    setPatientDetails(null);
    setBookingDetails(null);
    setIsSubmitting(false);
    setError(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((stepNumber) => (
            <div
              key={stepNumber}
              className={`flex items-center ${stepNumber < 4 ? 'flex-1' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= stepNumber
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {stepNumber}
              </div>
              {stepNumber < 4 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    step > stepNumber ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Service</span>
          <span>Schedule</span>
          <span>Details</span>
          <span>Confirm</span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Loading overlay */}
      {isSubmitting && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <p className="text-blue-800 text-sm">Booking your appointment...</p>
          </div>
        </div>
      )}

      {/* Current step content */}
      <div className="min-h-[400px]">
        {step === 1 && (
          <AppointmentTypeStep
            practiceId={practice.id}
            onSelectAppointmentType={handleSelectAppointmentType}
          />
        )}
        
        {step === 2 && appointmentType && (
          <AvailabilityStep
            practice={practice}
            appointmentType={appointmentType}
            onSelectSlot={handleSelectSlot}
          />
        )}
        
        {step === 3 && selectedSlot && (
          <PatientDetailsStep
            onSubmit={handlePatientDetailsSubmit}
          />
        )}
        
        {step === 4 && (
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <h2 className="text-2xl font-semibold text-gray-800">Booking Your Appointment</h2>
            <p className="text-gray-600">Please wait while we confirm your appointment...</p>
          </div>
        )}
        
        {step === 5 && bookingDetails && (
          <ConfirmationStep
            bookingDetails={bookingDetails}
            practiceName={practice.name}
            onScheduleAnother={handleScheduleAnother}
          />
        )}
        
        {step > 5 && (
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-800">Step {step}</h2>
            <p className="text-gray-600 mt-2">Coming soon...</p>
            <p className="text-sm text-gray-500 mt-4">
              Practice: {practice.name || practice.nexhealthSubdomain}
            </p>
            {appointmentType && (
              <p className="text-sm text-gray-500">
                Selected: {appointmentType.name} ({appointmentType.duration} min)
              </p>
            )}
            {selectedSlot && (
              <p className="text-sm text-gray-500">
                Slot: {new Date(selectedSlot.time).toLocaleString()}
              </p>
            )}
            {patientDetails && (
              <p className="text-sm text-gray-500">
                Patient: {patientDetails.firstName} {patientDetails.lastName}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}