"use client";

import { useState, useEffect } from 'react';
import { useScheduling } from '../SchedulingContext';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

interface SlotData {
  time: string;
  operatory_id?: number;
  providerId: number;
  locationId: number;
}

interface AvailabilityResponse {
  success: boolean;
  foundSlots: SlotData[];
  nextAvailableDate: string | null;
}

export function Step3_Scheduler() {
  const { state, selectDate, selectSlot, nextStep, prevStep, setError } = useScheduling();
  
  // Core state management
  const [isLoading, setIsLoading] = useState(true);
  const [allSlots, setAllSlots] = useState<SlotData[]>([]);
  const [availableDatesSet, setAvailableDatesSet] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [timesForSelectedDay, setTimesForSelectedDay] = useState<SlotData[]>([]);
  
  // Infinite scroll state
  const [searchEndDate, setSearchEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d;
  });
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [showLoadMore, setShowLoadMore] = useState(false);

  // Extract dependencies for clarity
  const practiceId = state.practice?.id;
  const nexhealthAppointmentTypeId = state.appointmentType?.nexhealthAppointmentTypeId;

  // Single fetch on component mount for initial 90 days
  useEffect(() => {
    const fetchInitialAvailability = async () => {
      if (!practiceId || !nexhealthAppointmentTypeId) {
        setError('Missing practice or appointment type information');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        console.log('[Step3_Scheduler] Fetching initial 90 days of availability...');

        const response = await fetch(
          `/api/laine-web/availability?practiceId=${practiceId}&nexhealthAppointmentTypeId=${nexhealthAppointmentTypeId}&startDate=${today}&searchDays=90`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch availability');
        }

        const data: AvailabilityResponse = await response.json();
        const slots = data.foundSlots || [];

        // Store all slots
        setAllSlots(slots);

        // Create a set of all available dates for fast lookup
        const availableDates = new Set<string>();
        slots.forEach(slot => {
          const slotDate = slot.time.split('T')[0]; // Extract YYYY-MM-DD from ISO string
          availableDates.add(slotDate);
        });
        setAvailableDatesSet(availableDates);

        console.log(`[Step3_Scheduler] Initial load: ${slots.length} slots across ${availableDates.size} days`);

      } catch (error) {
        console.error('Error fetching initial availability:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load availability';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceId, nexhealthAppointmentTypeId]);

  // Load more functionality for infinite scroll
  const handleLoadMore = async () => {
    if (isFetchingMore || !practiceId || !nexhealthAppointmentTypeId) return;

    try {
      setIsFetchingMore(true);
      setError(null);

      // Calculate the new start date (day after current search end date)
      const newStartDate = new Date(searchEndDate);
      newStartDate.setDate(newStartDate.getDate() + 1);
      const startDateString = newStartDate.toISOString().split('T')[0];

      console.log(`[Step3_Scheduler] Loading more: next 90 days starting from ${startDateString}`);

      const response = await fetch(
        `/api/laine-web/availability?practiceId=${practiceId}&nexhealthAppointmentTypeId=${nexhealthAppointmentTypeId}&startDate=${startDateString}&searchDays=90`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch more availability');
      }

      const data: AvailabilityResponse = await response.json();
      const newSlots = data.foundSlots || [];

      // Append new slots to existing ones
      setAllSlots(prevSlots => [...prevSlots, ...newSlots]);

      // Update available dates set with new dates
      const newAvailableDates = new Set<string>();
      newSlots.forEach(slot => {
        const slotDate = slot.time.split('T')[0];
        newAvailableDates.add(slotDate);
      });

      setAvailableDatesSet(prevDates => {
        const updatedSet = new Set(prevDates);
        newAvailableDates.forEach(date => updatedSet.add(date));
        return updatedSet;
      });

      // Update search end date by adding another 90 days
      const newEndDate = new Date(searchEndDate);
      newEndDate.setDate(newEndDate.getDate() + 90);
      setSearchEndDate(newEndDate);

      // Hide the load more button after successful load
      setShowLoadMore(false);

      console.log(`[Step3_Scheduler] Loaded ${newSlots.length} additional slots, total available dates: ${availableDatesSet.size + newAvailableDates.size}`);

      toast.success(`Loaded ${newAvailableDates.size} more days with availability`);

    } catch (error) {
      console.error('Error loading more availability:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load more dates';
      toast.error(errorMessage);
    } finally {
      setIsFetchingMore(false);
    }
  };

  // Handle month changes to detect when user navigates beyond loaded window
  const handleMonthChange = (month: Date) => {
    if (month > searchEndDate) {
      console.log(`[Step3_Scheduler] User navigated to ${month.toISOString().split('T')[0]} beyond loaded window ending ${searchEndDate.toISOString().split('T')[0]}`);
      setShowLoadMore(true);
    } else {
      setShowLoadMore(false);
    }
  };

  // Filter times when a day is selected
  useEffect(() => {
    if (selectedDay) {
      const dateString = selectedDay.toISOString().split('T')[0];
      const slotsForDate = allSlots.filter(slot => 
        slot.time.startsWith(dateString)
      );
      setTimesForSelectedDay(slotsForDate);
      
      // Update the scheduling context with the selected date
      selectDate(dateString);
    } else {
      setTimesForSelectedDay([]);
    }
  }, [selectedDay, allSlots, selectDate]);

  const handleTimeSelect = (slot: SlotData) => {
    selectSlot(slot);
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: state.practice?.timezone || 'America/Chicago',
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Show loading screen during initial data fetch
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Finding available appointments for you...
          </h2>
          <p className="text-gray-600">
            {state.appointmentType?.name} • {state.appointmentType?.duration} minutes
          </p>
        </div>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500">
            Checking the next 3 months for the best available times...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Choose your preferred date and time
        </h2>
        <p className="text-gray-600">
          {state.appointmentType?.name} • {state.appointmentType?.duration} minutes
        </p>
        {availableDatesSet.size > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            {availableDatesSet.size} days available • Navigate months to see more dates
          </p>
        )}
      </div>

      {availableDatesSet.size === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-gray-500 mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No appointments available
          </h3>
          <p className="text-gray-600 mb-4">
            There are currently no available appointments for {state.appointmentType?.name} in the next 3 months.
          </p>
          <p className="text-sm text-gray-500">
            Please contact the practice directly to schedule your appointment or try selecting a different appointment type.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="gap-0 p-0">
            <CardContent className="relative p-0 md:pr-48">
              <div className="p-6">
                <Calendar
                  mode="single"
                  selected={selectedDay}
                  onSelect={setSelectedDay}
                  onMonthChange={handleMonthChange}
                  showOutsideDays={false}
                  disabled={(date) => {
                    // Disable past dates
                    if (date < new Date(new Date().setHours(0, 0, 0, 0))) {
                      return true;
                    }
                    // For future dates, disable them if they are NOT in our available set
                    return !availableDatesSet.has(date.toISOString().split('T')[0]);
                  }}
                  modifiers={{
                    unavailable: (date) => {
                      if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
                      return !availableDatesSet.has(date.toISOString().split('T')[0]);
                    }
                  }}
                  modifiersClassNames={{
                    unavailable: "[&>button]:line-through opacity-50",
                  }}
                  className="bg-transparent p-0 [--cell-size:--spacing(10)] md:[--cell-size:--spacing(12)]"
                  formatters={{
                    formatWeekdayName: (date) => {
                      return date.toLocaleString("en-US", { weekday: "short" })
                    },
                  }}
                />
              </div>
              <div className="no-scrollbar inset-y-0 right-0 flex max-h-72 w-full scroll-pb-6 flex-col gap-4 overflow-y-auto border-t p-6 md:absolute md:max-h-none md:w-48 md:border-t-0 md:border-l">
                <div className="grid gap-2">
                  {selectedDay && timesForSelectedDay.length > 0 ? (
                    timesForSelectedDay.map((slot, index) => (
                      <Button
                        key={index}
                        variant={state.selectedSlot?.time === slot.time ? "default" : "outline"}
                        onClick={() => handleTimeSelect(slot)}
                        className="w-full shadow-none"
                      >
                        {formatTime(slot.time)}
                      </Button>
                    ))
                  ) : selectedDay ? (
                    <p className="text-gray-500 text-center text-sm py-4">
                      No available times for this date.
                    </p>
                  ) : (
                    <p className="text-gray-500 text-center text-sm py-4">
                      Select a date to see available times.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 border-t px-6 !py-5 md:flex-row">
              <div className="text-sm">
                {selectedDay && state.selectedSlot ? (
                  <>
                    Your <span className="font-medium">{state.appointmentType?.name}</span> is booked for{" "}
                    <span className="font-medium">
                      {formatDate(selectedDay)}
                    </span>
                    {" "}at <span className="font-medium">{formatTime(state.selectedSlot.time)}</span>.
                  </>
                ) : (
                  <>Select a date and time for your {state.appointmentType?.name || 'appointment'}.</>
                )}
              </div>
              <div className="flex gap-2 w-full md:ml-auto md:w-auto">
                <Button
                  onClick={prevStep}
                  variant="outline"
                  className="flex-1 md:flex-none"
                >
                  Back
                </Button>
                <Button
                  disabled={!state.selectedSlot}
                  onClick={nextStep}
                  className="flex-1 md:flex-none"
                >
                  Continue
                </Button>
              </div>
            </CardFooter>
          </Card>

          {/* Load More Button for Infinite Scroll */}
          {showLoadMore && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isFetchingMore}
                className="min-w-48"
              >
                {isFetchingMore ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                    Loading more dates...
                  </>
                ) : (
                  <>Check for later dates</>
                )}
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Load the next 3 months of availability
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 