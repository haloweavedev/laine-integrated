"use client";

import { useState } from "react";
import { toast } from "sonner";

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
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
  isDefault: boolean;
  isActive: boolean;
  provider: Provider;
}

interface SavedOperatory {
  id: string;
  nexhealthOperatoryId: string;
  name: string;
  isDefault: boolean;
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
      providers_used: Array<{
        id: string;
        name: string;
        nexhealthProviderId: string;
      }>;
      operatories_used: Array<{
        id: string;
        name: string;
        nexhealthOperatoryId: string;
      }>;
    };
  };
}

interface CheckAppointmentSlotsProps {
  appointmentTypes: AppointmentType[];
  savedProviders: SavedProvider[];
  savedOperatories: SavedOperatory[];
}

export function CheckAppointmentSlots({ 
  appointmentTypes, 
  savedProviders, 
  savedOperatories 
}: CheckAppointmentSlotsProps) {
  const [selectedAppointmentType, setSelectedAppointmentType] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedOperatories, setSelectedOperatories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [slotsData, setSlotsData] = useState<CheckSlotsResponse["data"] | null>(null);

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Filter active providers and operatories
  const activeProviders = savedProviders.filter(sp => sp.isActive);
  const activeOperatories = savedOperatories.filter(so => so.isActive);

  const handleProviderChange = (providerId: string, checked: boolean) => {
    if (checked) {
      setSelectedProviders(prev => [...prev, providerId]);
    } else {
      setSelectedProviders(prev => prev.filter(id => id !== providerId));
    }
  };

  const handleOperatoryChange = (operatoryId: string, checked: boolean) => {
    if (checked) {
      setSelectedOperatories(prev => [...prev, operatoryId]);
    } else {
      setSelectedOperatories(prev => prev.filter(id => id !== operatoryId));
    }
  };

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
          days: 1,
          providerIds: selectedProviders,
          operatoryIds: selectedOperatories
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
      <div className="mb-6">
        <h3 className="text-lg font-semibold">Check Appointment Slots</h3>
        <p className="text-sm text-gray-600">
          Test the appointment slot availability for specific dates, appointment types, providers, and operatories.
        </p>
      </div>

      {/* Form Controls */}
      <div className="space-y-6">
        {/* Basic Selection Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* Provider Selection */}
        {activeProviders.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Providers (leave blank to use all active providers)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeProviders.map(savedProvider => (
                <label 
                  key={savedProvider.id} 
                  className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedProviders.includes(savedProvider.provider.id)}
                    onChange={(e) => handleProviderChange(savedProvider.provider.id, e.target.checked)}
                    disabled={loading}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {`${savedProvider.provider.firstName || ''} ${savedProvider.provider.lastName}`.trim()}
                    </div>
                    <div className="text-xs text-gray-500">
                      ID: {savedProvider.provider.nexhealthProviderId}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Operatory Selection */}
        {activeOperatories.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Operatories (leave blank to use all active operatories)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeOperatories.map(operatory => (
                <label 
                  key={operatory.id} 
                  className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedOperatories.includes(operatory.id)}
                    onChange={(e) => handleOperatoryChange(operatory.id, e.target.checked)}
                    disabled={loading}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {operatory.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      ID: {operatory.nexhealthOperatoryId}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {slotsData && (
        <div className="border-t pt-6 mt-6">
          <div className="mb-4">
            <h4 className="font-medium text-gray-900 mb-2">
              Results for {formatDate(slotsData.requested_date)}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
              <div>
                <strong>Appointment Type:</strong> {slotsData.appointment_type.name} ({slotsData.appointment_type.duration} min)
              </div>
              <div>
                <strong>Total Slots Found:</strong> {slotsData.total_slots_found}
              </div>
            </div>

            {/* Debug Information */}
            <div className="bg-gray-50 rounded-md p-3 mb-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Search Parameters:</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
                <div>
                  <strong>Providers Used ({slotsData.debug_info.providers_checked}):</strong>
                  <ul className="mt-1 space-y-1">
                    {slotsData.debug_info.providers_used.map(provider => (
                      <li key={provider.id}>
                        • {provider.name} (ID: {provider.nexhealthProviderId})
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Operatories Used ({slotsData.debug_info.operatories_checked}):</strong>
                  {slotsData.debug_info.operatories_used.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {slotsData.debug_info.operatories_used.map(operatory => (
                        <li key={operatory.id}>
                          • {operatory.name} (ID: {operatory.nexhealthOperatoryId})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-gray-500">All available operatories</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {slotsData.has_availability ? (
            <div>
              <div className="mb-3">
                <span className="text-sm font-medium text-green-600">
                  ✅ {slotsData.total_slots_found} available slot(s) found
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {slotsData.available_slots.map((slot) => (
                  <div 
                    key={slot.slot_id}
                    className="bg-green-50 border border-green-200 rounded-md p-3"
                  >
                    <div className="font-medium text-green-800 text-sm mb-2">
                      {slot.display_range}
                    </div>
                    <div className="space-y-1 text-xs text-green-700">
                      <div>
                        <strong>Provider:</strong> {slot.provider_info.name}
                      </div>
                      <div className="text-green-600">
                        Provider ID: {slot.provider_info.nexhealthProviderId}
                      </div>
                      {slot.operatory_info && (
                        <>
                          <div>
                            <strong>Operatory:</strong> {slot.operatory_info.name}
                          </div>
                          <div className="text-green-600">
                            Operatory ID: {slot.operatory_info.nexhealthOperatoryId}
                          </div>
                        </>
                      )}
                    </div>
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
                Try selecting a different date, appointment type, or adjust provider/operatory selection.
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
          <li>• Optionally select specific providers and operatories to narrow the search</li>
          <li>• Click &quot;Check Available Slots&quot; to see available appointment times</li>
          <li>• This uses the same logic as the AI voice assistant to find appointment slots</li>
          <li>• View detailed provider and operatory information for each available slot</li>
        </ul>
      </div>
    </div>
  );
} 