"use client";

import { useState, useEffect } from 'react';
import { useScheduling } from '../SchedulingContext';
import { toast } from 'sonner';

interface AppointmentTypeAPI {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  spokenName: string | null;
}

export function Step2_AppointmentType() {
  const { state, selectAppointmentType, nextStep, prevStep, setError } = useScheduling();
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentTypeAPI[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);

  // Extract dependencies to clean up the array
  const practiceId = state.practice?.id;
  const patientStatus = state.patient.status;

  useEffect(() => {
    const fetchAppointmentTypes = async () => {
      if (!practiceId || !patientStatus) {
        setError('Missing practice or patient information');
        return;
      }

      try {
        setIsLoadingTypes(true);
        setError(null);

        const response = await fetch(
          `/api/laine-web/appointment-types?practiceId=${practiceId}&patientStatus=${patientStatus}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch appointment types');
        }

        const data = await response.json();
        setAppointmentTypes(data.appointmentTypes || []);

      } catch (error) {
        console.error('Error fetching appointment types:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load appointment types';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoadingTypes(false);
      }
    };

    fetchAppointmentTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceId, patientStatus]);

  const handleSelectAppointmentType = (appointmentType: AppointmentTypeAPI) => {
    selectAppointmentType({
      id: appointmentType.id,
      nexhealthAppointmentTypeId: appointmentType.nexhealthAppointmentTypeId,
      name: appointmentType.name,
      duration: appointmentType.duration,
      spokenName: appointmentType.spokenName
    });
    nextStep();
  };

  if (isLoadingTypes) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Loading available services...
          </h2>
        </div>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          What type of appointment do you need?
        </h2>
        <p className="text-gray-600">
          Select the service that best describes your visit.
        </p>
      </div>

      {appointmentTypes.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-500 mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">
            No appointment types are currently available for {state.patient.status.toLowerCase()} patients.
          </p>
          <p className="text-sm text-gray-400">
            Please contact the practice directly to schedule your appointment.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {appointmentTypes.map((appointmentType) => (
            <button
              key={appointmentType.id}
              onClick={() => handleSelectAppointmentType(appointmentType)}
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <h3 className="font-semibold text-gray-900 mb-2">
                {appointmentType.name}
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                Duration: {appointmentType.duration} minutes
              </p>
              {appointmentType.spokenName && (
                <p className="text-xs text-gray-500">
                  {appointmentType.spokenName}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={prevStep}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        
        {appointmentTypes.length === 0 && (
          <button
            onClick={prevStep}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        )}
      </div>
    </div>
  );
} 