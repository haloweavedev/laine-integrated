"use client";

import { useState } from 'react';
import { useScheduling } from '../SchedulingContext';
import { toast } from 'sonner';

export function Step4_Finalize() {
  const { state, setContactInfo, nextStep, prevStep, setLoading, setError } = useScheduling();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validate required fields
    if (!state.contactInfo.email.trim() || !state.contactInfo.phone.trim()) {
      setError('Email and phone number are required');
      return;
    }

    if (state.patient.status === 'RETURNING' && !state.contactInfo.dob.trim()) {
      setError('Date of birth is required for returning patients');
      return;
    }

    try {
      setIsSubmitting(true);
      setLoading(true);
      setError(null);

      // Prepare booking data
      const bookingData = {
        practice: state.practice!,
        patient: state.patient,
        appointmentType: state.appointmentType!,
        selectedSlot: state.selectedSlot!,
        contactInfo: state.contactInfo
      };

      console.log('[Step4_Finalize] Submitting booking:', bookingData);

      const response = await fetch('/api/laine-web/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bookingData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // Handle slot conflict specifically
        if (response.status === 409) {
          const conflictMessage = "We're so sorry, but that time slot was just taken. Please go back and select a different time.";
          setError(conflictMessage);
          toast.error(conflictMessage);
          return;
        }
        
        throw new Error(errorData.error || 'Booking failed');
      }

      const result = await response.json();
      console.log('[Step4_Finalize] Booking successful:', result);

      toast.success('Booking confirmed successfully!');
      nextStep(); // Move to confirmation step

    } catch (error) {
      console.error('Error submitting booking:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit booking';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

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
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Almost done!
        </h2>
        <p className="text-gray-600">
          Please provide your contact information to complete your booking.
        </p>
      </div>

      {/* Booking Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-3">Booking Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-blue-700">Service:</span>
            <span className="font-medium text-blue-900">{state.appointmentType?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-700">Duration:</span>
            <span className="font-medium text-blue-900">{state.appointmentType?.duration} minutes</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-700">Date:</span>
            <span className="font-medium text-blue-900">{state.selectedSlot && formatDate(state.selectedSlot.time)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-700">Time:</span>
            <span className="font-medium text-blue-900">{state.selectedSlot && formatTime(state.selectedSlot.time)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-700">Patient:</span>
            <span className="font-medium text-blue-900">{state.patient.firstName} {state.patient.lastName}</span>
          </div>
        </div>
      </div>

      {/* Contact Information Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email Address *
            </label>
            <input
              id="email"
              type="email"
              value={state.contactInfo.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                setContactInfo({ email: e.target.value })
              }
              placeholder="Enter your email"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              Phone Number *
            </label>
            <input
              id="phone"
              type="tel"
              value={state.contactInfo.phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                setContactInfo({ phone: e.target.value })
              }
              placeholder="Enter your phone number"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        {/* Date of Birth - Required for returning patients */}
        {state.patient.status === 'RETURNING' && (
          <div className="space-y-2">
            <label htmlFor="dob" className="block text-sm font-medium text-gray-700">
              Date of Birth *
            </label>
            <input
              id="dob"
              type="date"
              value={state.contactInfo.dob}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                setContactInfo({ dob: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500">
              We need your date of birth to verify your existing patient record.
            </p>
          </div>
        )}

        {/* Notes - Optional */}
        <div className="space-y-2">
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
            Additional Notes (Optional)
          </label>
          <textarea
            id="notes"
            value={state.contactInfo.notes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
              setContactInfo({ notes: e.target.value })
            }
            placeholder="Any additional information or special requests..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={prevStep}
            disabled={isSubmitting}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Back
          </button>
          
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isSubmitting ? 'Confirming Booking...' : 'Confirm Booking'}
          </button>
        </div>
      </form>
    </div>
  );
} 