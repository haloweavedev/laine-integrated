"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  spokenName: string | null;
  webPatientStatus: string;
}

interface AppointmentTypeStepProps {
  practiceId: string;
  onSelectAppointmentType: (type: AppointmentType) => void;
}

export function AppointmentTypeStep({ practiceId, onSelectAppointmentType }: AppointmentTypeStepProps) {
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAppointmentTypes = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/laine-web/appointment-types', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ practiceId }),
        });

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
      } finally {
        setIsLoading(false);
      }
    };

    fetchAppointmentTypes();
  }, [practiceId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Select Your Appointment Type
          </h2>
          <p className="text-gray-600">
            Loading available services...
          </p>
        </div>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Select Your Appointment Type
          </h2>
        </div>
        <Card className="p-6 text-center border-red-200 bg-red-50">
          <p className="text-red-800 mb-4">{error}</p>
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()}
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  if (appointmentTypes.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Select Your Appointment Type
          </h2>
        </div>
        <Card className="p-8 text-center">
          <div className="text-gray-500 mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No appointment types available
          </h3>
          <p className="text-gray-600">
            Please contact the practice directly to schedule your appointment.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Select Your Appointment Type
        </h2>
        <p className="text-gray-600">
          Choose the service you need to get started.
        </p>
      </div>

      <div className="space-y-3">
        {appointmentTypes.map((type) => (
          <Card key={type.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <Button
                variant="ghost"
                onClick={() => onSelectAppointmentType(type)}
                className="w-full h-auto p-6 justify-start text-left hover:bg-gray-50"
              >
                <div className="flex flex-col items-start space-y-1">
                  <div className="font-semibold text-gray-900">
                    {type.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {type.duration} minutes
                  </div>
                  {type.spokenName && type.spokenName !== type.name && (
                    <div className="text-xs text-gray-400">
                      Also known as: {type.spokenName}
                    </div>
                  )}
                </div>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}