"use client";

import { useState } from "react";
import { toast } from "sonner";

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  bookableOnline: boolean | null;
  spokenName: string | null;
  check_immediate_next_available: boolean;
}

interface Provider {
  id: string;
  nexhealthProviderId: string;
  firstName: string | null;
  lastName: string;
}

interface SavedProvider {
  id: string;
  providerId: string;
  isActive: boolean;
  provider: Provider;
}

interface SavedOperatory {
  id: string;
  nexhealthOperatoryId: string;
  name: string;
  isActive: boolean;
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
  provider_info: {
    id: string;
    name: string;
    nexhealthProviderId: string;
  };
  operatory_info: {
    id: string;
    name: string;
    nexhealthOperatoryId: string;
  } | null;
}

interface CheckSlotsResponse {
  success: boolean;
  data: {
    requested_date: string;
    appointment_type: {
      id: string; // Now returns Laine CUID
      nexhealthAppointmentTypeId?: string; // Optional reference
      name: string;
      duration: number;
    };
    available_slots: AppointmentSlot[];
    has_availability: boolean;
    total_slots_found: number;
    debug_info: {
      slot_length_used: number;
      overlapping_operatory_slots_param: string;
      raw_slots_before_lunch_filter: number;
      slots_after_lunch_filter: number;
      lunch_break_slots_filtered: number;
      providers_checked: number;
      operatories_checked: number;
      providers_used: Array<{
        id: string;
        name: string;
        nexhealthProviderId: string;
        acceptedAppointmentTypesCount: number;
      }>;
      operatories_used: Array<{
        id: string;
        name: string;
        nexhealthOperatoryId: string;
      }>;
    };
  };
}

interface CheckAppointmentSlotsToolProps {
  appointmentTypes: AppointmentType[];
  savedProviders: SavedProvider[];
  savedOperatories: SavedOperatory[];
}

export function CheckAppointmentSlotsTool({
  appointmentTypes,
  savedProviders,
  savedOperatories
}: CheckAppointmentSlotsToolProps) {
  const [selectedAppointmentTypeId, setSelectedAppointmentTypeId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [selectedOperatoryIds, setSelectedOperatoryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [slotsData, setSlotsData] = useState<CheckSlotsResponse["data"] | null>(null);

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Filter active providers and operatories
  const activeProviders = savedProviders.filter(sp => sp.isActive);
  const activeOperatories = savedOperatories.filter(so => so.isActive);

  const handleProviderChange = (savedProviderId: string, checked: boolean) => {
    if (checked) {
      setSelectedProviderIds(prev => [...prev, savedProviderId]);
    } else {
      setSelectedProviderIds(prev => prev.filter(id => id !== savedProviderId));
    }
  };

  const handleOperatoryChange = (operatoryId: string, checked: boolean) => {
    if (checked) {
      setSelectedOperatoryIds(prev => [...prev, operatoryId]);
    } else {
      setSelectedOperatoryIds(prev => prev.filter(id => id !== operatoryId));
    }
  };

  const handleCheckSlots = async () => {
    if (!selectedAppointmentTypeId) {
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
      const requestBody: { 
        appointmentTypeId: string; 
        requestedDate: string; 
        providerIds?: string[]; 
        operatoryIds?: string[] 
      } = {
        appointmentTypeId: selectedAppointmentTypeId,
        requestedDate: selectedDate
      };

      // Only include provider/operatory filters if specifically selected
      if (selectedProviderIds.length > 0) {
        requestBody.providerIds = selectedProviderIds;
      }
      if (selectedOperatoryIds.length > 0) {
        requestBody.operatoryIds = selectedOperatoryIds;
      }

      const response = await fetch('/api/practice-config/check-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
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

  const getProviderName = (provider: Provider) => {
    return `${provider.firstName || ''} ${provider.lastName}`.trim() || 'Unnamed Provider';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Check Appointment Slots</h2>
        <p className="text-gray-600">
          Check availability for specific appointment types and dates. Uses slot duration and 
          sets overlapping_operatory_slots=false. Optional filters for providers and operatories.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleCheckSlots(); }} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Appointment Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Appointment Type *
            </label>
            <select
              value={selectedAppointmentTypeId}
              onChange={(e) => setSelectedAppointmentTypeId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select appointment type</option>
              {appointmentTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.duration} min)
                </option>
              ))}
            </select>
          </div>

          {/* Date Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date *
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={today}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        {/* Optional Filters */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Optional Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Provider Filter */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Filter by Providers</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {activeProviders.map((savedProvider) => (
                  <label key={savedProvider.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedProviderIds.includes(savedProvider.id)}
                      onChange={(e) => handleProviderChange(savedProvider.id, e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      {getProviderName(savedProvider.provider)}
                    </span>
                  </label>
                ))}
              </div>
              {activeProviders.length === 0 && (
                <p className="text-sm text-gray-500">No active providers available</p>
              )}
            </div>

            {/* Operatory Filter */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Filter by Operatories</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {activeOperatories.map((operatory) => (
                  <label key={operatory.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedOperatoryIds.includes(operatory.id)}
                      onChange={(e) => handleOperatoryChange(operatory.id, e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      {operatory.name}
                    </span>
                  </label>
                ))}
              </div>
              {activeOperatories.length === 0 && (
                <p className="text-sm text-gray-500">No active operatories available</p>
              )}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-center pt-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Checking...' : 'Check Available Slots'}
          </button>
        </div>
      </form>

      {/* Results */}
      {slotsData && (
        <div className="mt-8 border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">
            Results for {formatDate(slotsData.requested_date)} - {slotsData.appointment_type.name}
          </h3>

          {slotsData.has_availability ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-green-600 font-medium">
                  Found {slotsData.total_slots_found} available slot(s)
                </p>
              </div>

              {/* Slots List */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {slotsData.available_slots.map((slot) => (
                  <div key={slot.slot_id} className="border border-gray-200 rounded-lg p-4">
                    <div className="font-medium text-blue-600">{slot.display_range}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Provider: {slot.provider_info.name}
                    </div>
                    {slot.operatory_info && (
                      <div className="text-sm text-gray-600">
                        Operatory: {slot.operatory_info.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Enhanced Debug Info */}
              <div className="bg-gray-50 rounded-lg p-4 mt-6">
                <h4 className="font-medium text-gray-900 mb-2">Search Summary & API Details</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p><strong>Slot length used:</strong> {slotsData.debug_info.slot_length_used} minutes</p>
                      <p><strong>Overlapping operatory slots:</strong> {slotsData.debug_info.overlapping_operatory_slots_param}</p>
                      <p><strong>Providers checked:</strong> {slotsData.debug_info.providers_checked}</p>
                      <p><strong>Operatories checked:</strong> {slotsData.debug_info.operatories_checked}</p>
                    </div>
                    <div>
                      <p><strong>Raw slots from NexHealth:</strong> {slotsData.debug_info.raw_slots_before_lunch_filter}</p>
                      <p><strong>Slots after filtering:</strong> {slotsData.debug_info.slots_after_lunch_filter}</p>
                    </div>
                  </div>
                  
                  {slotsData.debug_info.providers_used.length > 0 && (
                    <div className="mt-3">
                      <p><strong>Providers used:</strong></p>
                      <ul className="ml-4 list-disc">
                        {slotsData.debug_info.providers_used.map((provider) => (
                          <li key={provider.id}>
                            {provider.name} (accepts {provider.acceptedAppointmentTypesCount} appointment types)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {slotsData.debug_info.operatories_used.length > 0 && (
                    <div className="mt-3">
                      <p><strong>Operatories used:</strong></p>
                      <ul className="ml-4 list-disc">
                        {slotsData.debug_info.operatories_used.map((operatory) => (
                          <li key={operatory.id}>
                            {operatory.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No available slots found</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Search Summary & API Details</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p><strong>Slot length used:</strong> {slotsData.debug_info.slot_length_used} minutes</p>
                      <p><strong>Overlapping operatory slots:</strong> {slotsData.debug_info.overlapping_operatory_slots_param}</p>
                      <p><strong>Providers checked:</strong> {slotsData.debug_info.providers_checked}</p>
                      <p><strong>Operatories checked:</strong> {slotsData.debug_info.operatories_checked}</p>
                    </div>
                    <div>
                      <p><strong>Raw slots from NexHealth:</strong> {slotsData.debug_info.raw_slots_before_lunch_filter}</p>
                      <p><strong>Slots after filtering:</strong> {slotsData.debug_info.slots_after_lunch_filter}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 