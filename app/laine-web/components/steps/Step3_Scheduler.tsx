"use client";

import { useState, useEffect, useCallback } from 'react';
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
  const [availableSlots, setAvailableSlots] = useState<SlotData[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [timesForSelectedDay, setTimesForSelectedDay] = useState<SlotData[]>([]);
  const [disabledDates, setDisabledDates] = useState<Set<string>>(new Set());
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());

  // Helper function to get month key for tracking loaded months
  const getMonthKey = (date: Date) => {
    return `${date.getFullYear()}-${date.getMonth()}`;
  };

  // Helper function to calculate start date for a given month
  const getMonthStartDate = (date: Date) => {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    return startOfMonth.toISOString().split('T')[0];
  };

  const fetchAvailabilityForMonth = useCallback(async (monthDate: Date, isInitial = false) => {
    if (!state.practice?.id || !state.appointmentType?.nexhealthAppointmentTypeId) {
      if (isInitial) {
        setError('Missing practice or appointment type information');
      }
      return;
    }

    const monthKey = getMonthKey(monthDate);
    
    // Skip if we've already loaded this month
    if (loadedMonths.has(monthKey)) {
      return;
    }

    try {
      setIsLoadingAvailability(true);
      if (isInitial) {
        setError(null);
      }

      const startDate = getMonthStartDate(monthDate);
      
      const response = await fetch(
        `/api/laine-web/availability?practiceId=${state.practice.id}&nexhealthAppointmentTypeId=${state.appointmentType.nexhealthAppointmentTypeId}&startDate=${startDate}&searchDays=31`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch availability');
      }

      const data: AvailabilityResponse = await response.json();
      const newSlots = data.foundSlots || [];

      // Append new slots to existing ones
      setAvailableSlots(prevSlots => [...prevSlots, ...newSlots]);

      // Extract unique dates from new slots and add to disabled dates set
      const newAvailableDates = new Set<string>();
      newSlots.forEach(slot => {
        const slotDate = slot.time.split('T')[0];
        newAvailableDates.add(slotDate);
      });

      // Update disabled dates - remove newly available dates from disabled set
      setDisabledDates(prevDisabled => {
        const newDisabled = new Set(prevDisabled);
        newAvailableDates.forEach(date => newDisabled.delete(date));
        return newDisabled;
      });

      // Mark this month as loaded
      setLoadedMonths(prev => new Set([...prev, monthKey]));

      console.log(`[Step3_Scheduler] Loaded ${newSlots.length} slots for month ${monthKey}`);

    } catch (error) {
      console.error('Error fetching availability for month:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load availability';
      if (isInitial) {
        setError(errorMessage);
        toast.error(errorMessage);
      } else {
        toast.error(`Failed to load availability for ${monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
      }
    } finally {
      setIsLoadingAvailability(false);
    }
  }, [state.practice?.id, state.appointmentType?.nexhealthAppointmentTypeId, loadedMonths, setError]);

  // Initial load effect
  useEffect(() => {
    fetchAvailabilityForMonth(new Date(), true);
  }, [fetchAvailabilityForMonth]);

  // Month change effect  
  useEffect(() => {
    fetchAvailabilityForMonth(currentMonth);
  }, [currentMonth, fetchAvailabilityForMonth]);

  useEffect(() => {
    // When selectedDay changes, filter slots for that date and update context
    if (selectedDay) {
      const dateString = selectedDay.toISOString().split('T')[0];
      const slotsForDate = availableSlots.filter(slot => 
        slot.time.startsWith(dateString)
      );
      setTimesForSelectedDay(slotsForDate);
      
      // Update the scheduling context with the selected date
      selectDate(dateString);
    } else {
      setTimesForSelectedDay([]);
    }
  }, [selectedDay, availableSlots, selectDate]);

  const handleTimeSelect = (slot: SlotData) => {
    selectSlot(slot);
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Convert disabled dates set to array for calendar
  const disabledDatesArray = Array.from(disabledDates).map(dateStr => new Date(dateStr));

  if (isLoadingAvailability && availableSlots.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Loading availability...
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
          Choose your preferred date and time
        </h2>
        <p className="text-gray-600">
          {state.appointmentType?.name} • {state.appointmentType?.duration} minutes
        </p>
      </div>

      <Card className="gap-0 p-0">
        <CardContent className="relative p-0 md:pr-48">
          <div className="p-6">
            <div className="relative">
              {isLoadingAvailability && (
                <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              )}
              <Calendar
                mode="single"
                selected={selectedDay}
                onSelect={setSelectedDay}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                defaultMonth={selectedDay}
                disabled={(date) => {
                  const dateStr = date.toISOString().split('T')[0];
                  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
                  return isPast || disabledDates.has(dateStr);
                }}
                showOutsideDays={false}
                modifiers={{
                  booked: disabledDatesArray,
                }}
                modifiersClassNames={{
                  booked: "[&>button]:line-through opacity-100",
                }}
                className="bg-transparent p-0 [--cell-size:--spacing(10)] md:[--cell-size:--spacing(12)]"
                formatters={{
                  formatWeekdayName: (date) => {
                    return date.toLocaleString("en-US", { weekday: "short" })
                  },
                }}
              />
            </div>
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
    </div>
  );
} 