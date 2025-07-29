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
  const [availableSlots, setAvailableSlots] = useState<SlotData[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [timesForSelectedDay, setTimesForSelectedDay] = useState<SlotData[]>([]);
  const [disabledDates, setDisabledDates] = useState<Date[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

  useEffect(() => {
    const fetchInitialAvailability = async () => {
      if (!state.practice?.id || !state.appointmentType?.id) {
        setError('Missing practice or appointment type information');
        return;
      }

      try {
        setIsLoadingAvailability(true);
        setError(null);

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        const response = await fetch(
          `/api/laine-web/availability?practiceId=${state.practice.id}&appointmentTypeId=${state.appointmentType.id}&startDate=${today}&searchDays=60`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch availability');
        }

        const data: AvailabilityResponse = await response.json();
        setAvailableSlots(data.foundSlots || []);

        // Extract unique dates from slots and create a Set for efficient lookups
        const uniqueDates = new Set<string>();
        data.foundSlots.forEach(slot => {
          const slotDate = slot.time.split('T')[0]; // Extract YYYY-MM-DD from ISO string
          uniqueDates.add(slotDate);
        });

        // Calculate disabled dates for the calendar
        const disabled: Date[] = [];
        const currentDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 60); // 60 days ahead

        // Iterate through all dates in the range
        for (let d = new Date(currentDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateString = d.toISOString().split('T')[0];
          const isPast = d < new Date(new Date().setHours(0, 0, 0, 0));
          const isUnavailable = !uniqueDates.has(dateString);
          
          if (isPast || isUnavailable) {
            disabled.push(new Date(d));
          }
        }
        setDisabledDates(disabled);

        console.log(`[Step3_Scheduler] Found ${data.foundSlots.length} slots across ${uniqueDates.size} days`);

      } catch (error) {
        console.error('Error fetching availability:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load availability';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoadingAvailability(false);
      }
    };

    fetchInitialAvailability();
  }, [state.practice?.id, state.appointmentType?.id, setError]);

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

  if (isLoadingAvailability) {
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
            <Calendar
              mode="single"
              selected={selectedDay}
              onSelect={setSelectedDay}
              defaultMonth={selectedDay}
              disabled={disabledDates}
              showOutsideDays={false}
              modifiers={{
                booked: disabledDates,
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