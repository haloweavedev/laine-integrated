"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Practice {
  id: string;
  name: string | null;
  timezone: string | null;
}

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
}

interface ProcessedSlot {
  time: string;
  end_time: string;
  operatory_id: number;
  pid: number;
  lid: number;
}

interface BucketedDay {
  date: string;
  morning: ProcessedSlot[];
  afternoon: ProcessedSlot[];
  evening: ProcessedSlot[];
}

interface AvailabilityStepProps {
  practice: Practice;
  appointmentType: AppointmentType;
  onSelectSlot: (slot: ProcessedSlot) => void;
}

export function AvailabilityStep({ practice, appointmentType, onSelectSlot }: AvailabilityStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstSlot, setFirstSlot] = useState<ProcessedSlot | null>(null);
  const [showFullView, setShowFullView] = useState(false);
  const [fullDays, setFullDays] = useState<BucketedDay[]>([]);
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);

  // Fetch first available slot on mount
  useEffect(() => {
    const fetchFirstSlot = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/laine-web/availability', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            practiceId: practice.id,
            nexhealthAppointmentTypeId: appointmentType.nexhealthAppointmentTypeId,
            mode: 'first'
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch availability');
        }

        const data = await response.json();
        setFirstSlot(data.firstSlot);
      } catch (error) {
        console.error('Error fetching first slot:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load availability';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFirstSlot();
  }, [practice.id, appointmentType.nexhealthAppointmentTypeId]);

  const handleShowMoreOptions = async () => {
    try {
      setIsLoadingFull(true);
      setError(null);

      const response = await fetch('/api/laine-web/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          practiceId: practice.id,
          nexhealthAppointmentTypeId: appointmentType.nexhealthAppointmentTypeId,
          mode: 'fullday'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch full availability');
      }

      const data = await response.json();
      setFullDays(data.days || []);
      setShowFullView(true);
    } catch (error) {
      console.error('Error fetching full availability:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load more options';
      setError(errorMessage);
    } finally {
      setIsLoadingFull(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: practice.timezone || 'America/Chicago',
    });
  };

  const getBucketLabel = (bucketName: string) => {
    switch (bucketName) {
      case 'morning': return 'Morning';
      case 'afternoon': return 'Afternoon';
      case 'evening': return 'Evening';
      default: return bucketName;
    }
  };

  const getBucketTimeRange = (bucketName: string) => {
    switch (bucketName) {
      case 'morning': return '(Before 12:00 PM)';
      case 'afternoon': return '(12:00 PM - 5:00 PM)';
      case 'evening': return '(After 5:00 PM)';
      default: return '';
    }
  };

  const toggleBucket = (dayDate: string, bucketName: string) => {
    if (expandedDay === dayDate && expandedBucket === bucketName) {
      setExpandedDay(null);
      setExpandedBucket(null);
    } else {
      setExpandedDay(dayDate);
      setExpandedBucket(bucketName);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Finding Your Next Available Appointment
          </h2>
          <p className="text-gray-600">
            {appointmentType.name} • {appointmentType.duration} minutes
          </p>
        </div>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500">
            Checking availability...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Schedule Your Appointment
          </h2>
          <p className="text-gray-600">
            {appointmentType.name} • {appointmentType.duration} minutes
          </p>
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

  if (!firstSlot && !showFullView) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            No Available Appointments
          </h2>
          <p className="text-gray-600">
            {appointmentType.name} • {appointmentType.duration} minutes
          </p>
        </div>
        <Card className="p-8 text-center">
          <div className="text-gray-500 mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No appointments available
          </h3>
          <p className="text-gray-600">
            There are currently no available appointments for {appointmentType.name} in the next 90 days.
          </p>
          <p className="text-sm text-gray-500 mt-4">
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
          Schedule Your Appointment
        </h2>
        <p className="text-gray-600">
          {appointmentType.name} • {appointmentType.duration} minutes
        </p>
      </div>

      {!showFullView && firstSlot ? (
        // Fast Path: Show first available slot
        <Card className="p-6">
          <div className="text-center space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Our first availability is:
              </h3>
              <div className="text-xl font-bold text-blue-600">
                {formatDate(firstSlot.time.split('T')[0])}
              </div>
              <div className="text-lg text-gray-700">
                at {formatTime(firstSlot.time)}
              </div>
            </div>
            
            <p className="text-gray-600">
              Does that work for you?
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => onSelectSlot(firstSlot)}
                className="flex-1 sm:flex-none"
              >
                Yes, schedule it!
              </Button>
              <Button
                variant="outline"
                onClick={handleShowMoreOptions}
                disabled={isLoadingFull}
                className="flex-1 sm:flex-none"
              >
                {isLoadingFull ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                    Loading...
                  </>
                ) : (
                  'Show me other options'
                )}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        // Full View: 7-day bucketed view
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">
              Choose from the next 7 days
            </h3>
            <p className="text-sm text-gray-500">
              Click on a time period to see available slots
            </p>
          </div>
          
          {fullDays.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-gray-600">
                No appointments available in the next 7 days.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Please contact the practice directly to schedule your appointment.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {fullDays.map((day) => (
                <Card key={day.date}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      {formatDate(day.date)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(['morning', 'afternoon', 'evening'] as const).map((bucket) => {
                        const slots = day[bucket];
                        const hasSlots = slots.length > 0;
                        const isExpanded = expandedDay === day.date && expandedBucket === bucket;
                        
                        return (
                          <div key={bucket}>
                            <Button
                              variant={hasSlots ? "outline" : "secondary"}
                              disabled={!hasSlots}
                              onClick={() => hasSlots && toggleBucket(day.date, bucket)}
                              className={`w-full justify-between ${!hasSlots ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <div className="text-left">
                                <div className="font-medium">{getBucketLabel(bucket)}</div>
                                <div className="text-xs text-gray-500">
                                  {getBucketTimeRange(bucket)}
                                </div>
                              </div>
                              <div className="text-sm">
                                {hasSlots ? `${slots.length} slot${slots.length > 1 ? 's' : ''}` : 'None'}
                              </div>
                            </Button>
                            
                            {isExpanded && hasSlots && (
                              <div className="mt-2 space-y-1">
                                {slots.map((slot, index) => (
                                  <Button
                                    key={`${slot.time}-${index}`}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onSelectSlot(slot)}
                                    className="w-full justify-center text-sm"
                                  >
                                    {formatTime(slot.time)}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}