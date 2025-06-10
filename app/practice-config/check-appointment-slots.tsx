"use client";

import { useState } from "react";
import { toast } from "sonner";

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
}

interface AppointmentSlot {
  slot_id: string;
  time: string;
  end_time: string;
  display_time: string;
  display_end_time: string;
  display_range: string;
  operatory_id?: number;
  provider_id: number;
  location_id: number;
}

interface CheckSlotsResponse {
  success: boolean;
  data: {
    requested_date: string;
    appointment_type: {
      id: string;
      name: string;
      duration: number;
    };
    available_slots: AppointmentSlot[];
    has_availability: boolean;
    total_slots_found: number;
    debug_info: {
      providers_checked: number;
      operatories_checked: number;
    };
  };
}

interface CheckAppointmentSlotsProps {
  appointmentTypes: AppointmentType[];
}

export function CheckAppointmentSlots({ appointmentTypes }: CheckAppointmentSlotsProps) {
  const [selectedAppointmentType, setSelectedAppointmentType] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [slotsData, setSlotsData] = useState<CheckSlotsResponse["data"] | null>(null);

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const handleCheckSlots = async () => {
    if (!selectedAppointmentType) {
      toast.error("Please select an appointment type");
      return;
    }

    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }

    // Validate date is not in the past
    if (selectedDate < today) {
      toast.error("Please select a current or future date");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/practice-config/check-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentTypeId: selectedAppointmentType,
          requestedDate: selectedDate,
          days: 1
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to check appointment slots');
      }

      const result: CheckSlotsResponse = await response.json();
      setSlotsData(result.data);

      if (result.data.has_availability) {
        toast.success(`Found ${result.data.total_slots_found} available slot(s)!`);
      } else {
        toast.info("No available slots found for the selected date and appointment type");
      }

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check appointment slots');
      console.error(error);
      setSlotsData(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString + 'T00:00:00');
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Check Appointment Slots</h3>
        <p className="text-sm text-gray-600">
          Test the appointment slot availability for specific dates and appointment types.
        </p>
      </div>

      {/* Form Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Appointment Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Appointment Type *
          </label>
          <select
            value={selectedAppointmentType}
            onChange={(e) => setSelectedAppointmentType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            <option value="">Select appointment type</option>
            {appointmentTypes.map(type => (
              <option key={type.id} value={type.nexhealthAppointmentTypeId}>
                {type.name} ({type.duration} min)
              </option>
            ))}
          </select>
        </div>

        {/* Date Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date *
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={today}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>

        {/* Check Button */}
        <div className="flex items-end">
          <button
            onClick={handleCheckSlots}
            disabled={loading || !selectedAppointmentType || !selectedDate}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Checking...' : 'Check Available Slots'}
          </button>
        </div>
      </div>

      {/* Results */}
      {slotsData && (
        <div className="border-t pt-6">
          <div className="mb-4">
            <h4 className="font-medium text-gray-900 mb-2">
              Results for {formatDate(slotsData.requested_date)}
            </h4>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>
                <strong>Appointment Type:</strong> {slotsData.appointment_type.name}
              </span>
              <span>
                <strong>Duration:</strong> {slotsData.appointment_type.duration} minutes
              </span>
              <span>
                <strong>Providers Checked:</strong> {slotsData.debug_info.providers_checked}
              </span>
              <span>
                <strong>Operatories Checked:</strong> {slotsData.debug_info.operatories_checked}
              </span>
            </div>
          </div>

          {slotsData.has_availability ? (
            <div>
              <div className="mb-3">
                <span className="text-sm font-medium text-green-600">
                  ✅ {slotsData.total_slots_found} available slot(s) found
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {slotsData.available_slots.map((slot) => (
                  <div 
                    key={slot.slot_id}
                    className="bg-green-50 border border-green-200 rounded-md p-3 text-center"
                  >
                    <div className="font-medium text-green-800 text-sm">
                      {slot.display_range}
                    </div>
                    {slot.operatory_id && (
                      <div className="text-xs text-green-600 mt-1">
                        Operatory: {slot.operatory_id}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-yellow-600 mb-2">
                ⚠️ No available slots found
              </div>
              <p className="text-sm text-gray-600">
                Try selecting a different date or appointment type.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h5 className="font-medium text-blue-900 mb-2">How to use:</h5>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Select an appointment type from your synced NexHealth appointment types</li>
          <li>• Choose a date (today or in the future)</li>
          <li>• Click &quot;Check Available Slots&quot; to see available appointment times</li>
          <li>• This uses the same logic as the AI voice assistant to find appointment slots</li>
        </ul>
      </div>
    </div>
  );
} 