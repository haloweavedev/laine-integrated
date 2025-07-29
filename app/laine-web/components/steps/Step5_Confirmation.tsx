"use client";

import { useScheduling } from '../SchedulingContext';

export function Step5_Confirmation() {
  const { state, resetState } = useScheduling();

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString([], { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6 text-center">
      {/* Success Icon */}
      <div className="flex justify-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* Success Message */}
      <div>
        <h2 className="text-3xl font-bold text-green-600 mb-2">
          Booking Confirmed! 
        </h2>
        <p className="text-lg text-gray-600">
          Your appointment has been successfully scheduled.
        </p>
      </div>

      {/* Appointment Details */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 max-w-md mx-auto">
        <h3 className="font-semibold text-gray-900 mb-4">Appointment Details</h3>
        <div className="space-y-3 text-left">
          <div className="flex justify-between">
            <span className="text-gray-600">Patient:</span>
            <span className="font-medium text-gray-900">
              {state.patient.firstName} {state.patient.lastName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Service:</span>
            <span className="font-medium text-gray-900">{state.appointmentType?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Duration:</span>
            <span className="font-medium text-gray-900">{state.appointmentType?.duration} minutes</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Date:</span>
            <span className="font-medium text-gray-900">
              {state.selectedSlot && formatDate(state.selectedSlot.time)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Time:</span>
            <span className="font-medium text-gray-900">
              {state.selectedSlot && formatTime(state.selectedSlot.time)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Email:</span>
            <span className="font-medium text-gray-900">{state.contactInfo.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Phone:</span>
            <span className="font-medium text-gray-900">{state.contactInfo.phone}</span>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
        <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
        <ul className="text-sm text-blue-800 space-y-1 text-left">
          <li>• You will receive a confirmation email shortly</li>
          <li>• Our office may call to confirm your appointment</li>
          <li>• Please arrive 15 minutes early for your appointment</li>
          <li>• Bring a valid ID and your insurance card</li>
        </ul>
      </div>

      {/* Contact Information */}
      <div className="text-sm text-gray-600">
        <p className="mb-2">
          Need to make changes to your appointment?
        </p>
        <p>
          Please contact our office directly.
        </p>
      </div>

      {/* Schedule Another Button */}
      <div className="pt-4">
        <button
          onClick={resetState}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Schedule Another Appointment
        </button>
      </div>
    </div>
  );
} 