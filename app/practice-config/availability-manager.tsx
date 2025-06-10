"use client";

import { useState } from "react";
import { toast } from "sonner";

interface Provider {
  id: string;
  nexhealthProviderId: string;
  firstName: string | null;
  lastName: string;
}

interface SavedOperatory {
  id: string;
  nexhealthOperatoryId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
}

interface ManualAvailabilityData {
  id: string;
  nexhealthAvailabilityId: string | null;
  provider: {
    id: string;
    firstName: string | null;
    lastName: string;
    nexhealthProviderId: string;
  };
  savedOperatory: {
    id: string;
    name: string;
    nexhealthOperatoryId: string;
  } | null;
  daysOfWeek: string[];
  beginTime: string;
  endTime: string;
  appointmentTypeIds: string[];
  appointmentTypeNames?: string[];
  isActive: boolean;
  lastSyncWithNexhealthAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AvailabilityFormData {
  providerId: string;
  operatoryId: string;
  daysOfWeek: string[];
  beginTime: string;
  endTime: string;
  appointmentTypeIds: string[];
  isActive: boolean;
}

interface AvailabilityManagerProps {
  practiceId: string;
  providers: Provider[];
  savedOperatories: SavedOperatory[];
  appointmentTypes: AppointmentType[];
  initialAvailabilities: ManualAvailabilityData[];
  onUpdate: () => void;
}

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday', 
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

export function AvailabilityManager({
  providers,
  savedOperatories,
  appointmentTypes,
  initialAvailabilities,
  onUpdate
}: AvailabilityManagerProps) {
  const [availabilities] = useState<ManualAvailabilityData[]>(initialAvailabilities);
  const [showForm, setShowForm] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<ManualAvailabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<AvailabilityFormData>({
    providerId: '',
    operatoryId: '',
    daysOfWeek: [],
    beginTime: '09:00',
    endTime: '17:00',
    appointmentTypeIds: [],
    isActive: true
  });

  const resetForm = () => {
    setFormData({
      providerId: '',
      operatoryId: '',
      daysOfWeek: [],
      beginTime: '09:00',
      endTime: '17:00',
      appointmentTypeIds: [],
      isActive: true
    });
    setEditingAvailability(null);
    setShowForm(false);
  };

  const handleAddNew = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (availability: ManualAvailabilityData) => {
    setFormData({
      providerId: availability.provider.id,
      operatoryId: availability.savedOperatory?.id || '',
      daysOfWeek: availability.daysOfWeek,
      beginTime: availability.beginTime,
      endTime: availability.endTime,
      appointmentTypeIds: availability.appointmentTypeIds,
      isActive: availability.isActive
    });
    setEditingAvailability(availability);
    setShowForm(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.providerId) {
      toast.error('Please select a provider');
      return;
    }
    
    if (formData.daysOfWeek.length === 0) {
      toast.error('Please select at least one day of the week');
      return;
    }
    
    if (formData.appointmentTypeIds.length === 0) {
      toast.error('Please select at least one appointment type');
      return;
    }

    // Validate time format and logic
    const beginTime = formData.beginTime;
    const endTime = formData.endTime;
    const [beginHour, beginMin] = beginTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const beginMinutes = beginHour * 60 + beginMin;
    const endMinutes = endHour * 60 + endMin;

    if (endMinutes <= beginMinutes) {
      toast.error('End time must be after begin time');
      return;
    }

    setLoading(true);
    try {
      const url = editingAvailability 
        ? `/api/practice-config/availabilities/${editingAvailability.id}`
        : '/api/practice-config/availabilities';
      
      const method = editingAvailability ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          operatoryId: formData.operatoryId || null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save availability');
      }

      toast.success(editingAvailability ? 'Availability updated successfully!' : 'Availability created successfully!');
      resetForm();
      onUpdate(); // Refresh parent data
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save availability');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (availability: ManualAvailabilityData) => {
    if (!confirm('Are you sure you want to delete this availability? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/practice-config/availabilities/${availability.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete availability');
      }

      toast.success('Availability deleted successfully!');
      onUpdate(); // Refresh parent data
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete availability');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDayToggle = (day: string) => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day]
    }));
  };

  const handleAppointmentTypeToggle = (typeId: string) => {
    setFormData(prev => ({
      ...prev,
      appointmentTypeIds: prev.appointmentTypeIds.includes(typeId)
        ? prev.appointmentTypeIds.filter(id => id !== typeId)
        : [...prev.appointmentTypeIds, typeId]
    }));
  };

  const formatSyncStatus = (availability: ManualAvailabilityData) => {
    if (availability.syncError) {
      return (
        <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
          Sync Error: {availability.syncError}
        </span>
      );
    }
    
    if (availability.nexhealthAvailabilityId && availability.lastSyncWithNexhealthAt) {
      return (
        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
          Synced: {new Date(availability.lastSyncWithNexhealthAt).toLocaleDateString()}
        </span>
      );
    }
    
    return (
      <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
        Pending Sync
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">Manual Availability Configuration</h3>
          <p className="text-sm text-gray-600">
            Define when your providers are available for specific appointment types and operatories.
          </p>
        </div>
        <button
          onClick={handleAddNew}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Availability
        </button>
      </div>

      {/* Existing Availabilities List */}
      {availabilities.length > 0 ? (
        <div className="space-y-4 mb-6">
          {availabilities.map((availability) => (
            <div key={availability.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-gray-900">
                      {availability.provider.firstName} {availability.provider.lastName}
                    </h4>
                    {availability.savedOperatory && (
                      <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {availability.savedOperatory.name}
                      </span>
                    )}
                    {!availability.isActive && (
                      <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Days:</span>
                      <div className="mt-1">
                        {availability.daysOfWeek.join(', ')}
                      </div>
                    </div>
                    
                    <div>
                      <span className="font-medium text-gray-700">Time:</span>
                      <div className="mt-1">
                        {availability.beginTime} - {availability.endTime}
                      </div>
                    </div>
                    
                    <div className="md:col-span-2">
                      <span className="font-medium text-gray-700">Appointment Types:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {availability.appointmentTypeIds.length > 0 ? (
                          availability.appointmentTypeIds.map(typeId => {
                            const apptType = appointmentTypes.find(at => at.nexhealthAppointmentTypeId === typeId);
                            return (
                              <span key={typeId} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                                {apptType ? `${apptType.name} (ID: ${typeId})` : `Unknown Type (ID: ${typeId})`}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-xs text-gray-500">No specific types (applies to all)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  {formatSyncStatus(availability)}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(availability)}
                      disabled={loading}
                      className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(availability)}
                      disabled={loading}
                      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>No manual availabilities configured yet.</p>
          <p className="text-sm">Click &quot;Add Availability&quot; to get started.</p>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {editingAvailability ? 'Edit Availability' : 'Add New Availability'}
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {/* Provider Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Provider *
                  </label>
                  <select
                    value={formData.providerId}
                    onChange={(e) => setFormData(prev => ({ ...prev, providerId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select a provider</option>
                    {providers.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.firstName} {provider.lastName} (ID: {provider.nexhealthProviderId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Operatory Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Operatory (Optional)
                  </label>
                  <select
                    value={formData.operatoryId}
                    onChange={(e) => setFormData(prev => ({ ...prev, operatoryId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Any operatory</option>
                    {savedOperatories.map(operatory => (
                      <option key={operatory.id} value={operatory.id}>
                        {operatory.name} (ID: {operatory.nexhealthOperatoryId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Days of Week */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Days of Week *
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <label key={day} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={formData.daysOfWeek.includes(day)}
                          onChange={() => handleDayToggle(day)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Time Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Begin Time *
                    </label>
                    <input
                      type="time"
                      value={formData.beginTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, beginTime: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Time *
                    </label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                {/* Appointment Types */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Appointment Types *
                  </label>
                  <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-3 space-y-2">
                    {appointmentTypes.map(type => (
                      <label key={type.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={formData.appointmentTypeIds.includes(type.nexhealthAppointmentTypeId)}
                          onChange={() => handleAppointmentTypeToggle(type.nexhealthAppointmentTypeId)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        {type.name} (ID: {type.nexhealthAppointmentTypeId}) ({type.duration} min)
                      </label>
                    ))}
                  </div>
                </div>

                {/* Active Status */}
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    Active (availability will be used for scheduling)
                  </label>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={loading}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Saving...' : (editingAvailability ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 