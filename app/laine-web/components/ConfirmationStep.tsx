"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

interface ConfirmationStepProps {
  bookingDetails: BookingDetails;
  practiceName: string | null;
  onScheduleAnother: () => void;
}

export function ConfirmationStep({ bookingDetails, practiceName, onScheduleAnother }: ConfirmationStepProps) {
  const { appointmentDetails } = bookingDetails;

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago' // Default timezone, could be made dynamic
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mb-4">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h2 className="text-3xl font-bold text-green-600 mb-2">
          Appointment Confirmed!
        </h2>
        <p className="text-gray-600 text-lg">
          Your appointment has been successfully scheduled.
        </p>
      </div>

      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl text-green-800">
            Appointment Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium text-gray-700">Patient</div>
              <div className="text-gray-900">{appointmentDetails.patientName}</div>
            </div>
            
            <div>
              <div className="font-medium text-gray-700">Service</div>
              <div className="text-gray-900">{appointmentDetails.appointmentType}</div>
            </div>
            
            <div>
              <div className="font-medium text-gray-700">Duration</div>
              <div className="text-gray-900">{appointmentDetails.duration} minutes</div>
            </div>
            
            <div>
              <div className="font-medium text-gray-700">Practice</div>
              <div className="text-gray-900">{practiceName || 'Dental Practice'}</div>
            </div>
            
            <div>
              <div className="font-medium text-gray-700">Date</div>
              <div className="text-gray-900 font-semibold">
                {formatDate(appointmentDetails.startTime)}
              </div>
            </div>
            
            <div>
              <div className="font-medium text-gray-700">Time</div>
              <div className="text-gray-900 font-semibold">
                {formatTime(appointmentDetails.startTime)} - {formatTime(appointmentDetails.endTime)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-6">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-sm text-blue-800">
              <div className="font-medium mb-1">What&apos;s Next?</div>
              <ul className="space-y-1 text-blue-700">
                <li>• You should receive a confirmation email shortly</li>
                <li>• The practice may contact you to confirm details</li>
                <li>• Please arrive 15 minutes early for your appointment</li>
                <li>• Bring a valid ID and insurance card (if applicable)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="text-sm text-gray-600">
              <div className="font-medium mb-1">Need to make changes?</div>
              <p>Please contact the practice directly to reschedule or cancel your appointment.</p>
            </div>
            
            <div className="pt-4 border-t">
              <Button
                onClick={onScheduleAnother}
                variant="outline"
                className="w-full sm:w-auto"
              >
                Schedule Another Appointment
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hidden details for debugging/support */}
      <details className="text-xs text-gray-400">
        <summary className="cursor-pointer hover:text-gray-600">Technical Details</summary>
        <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono">
          <div>Appointment ID: {bookingDetails.nexhealthAppointmentId}</div>
          <div>Patient ID: {bookingDetails.nexhealthPatientId}</div>
          <div>Provider ID: {appointmentDetails.providerId}</div>
          <div>Operatory ID: {appointmentDetails.operatoryId}</div>
        </div>
      </details>
    </div>
  );
}