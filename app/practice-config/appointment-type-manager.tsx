"use client";

import { useState } from "react";
import { toast } from "sonner";

interface AppointmentTypeData {
  id: string; // Local CUID
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number; // In minutes
  bookableOnline: boolean | null;
  parentType: string | null;
  parentId: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AppointmentTypeFormData {
  name: string;
  minutes: number;
  bookableOnline: boolean;
}

interface AppointmentTypeManagerProps {
  initialAppointmentTypes: AppointmentTypeData[];
  onUpdate: () => void;
}

export function AppointmentTypeManager({
  initialAppointmentTypes,
  onUpdate
}: AppointmentTypeManagerProps) {
  const [appointmentTypes] = useState<AppointmentTypeData[]>(initialAppointmentTypes);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingAppointmentType, setEditingAppointmentType] = useState<AppointmentTypeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<AppointmentTypeFormData>({
    name: '',
    minutes: 30,
    bookableOnline: true
  });

  const resetForm = () => {
    setFormData({
      name: '',
      minutes: 30,
      bookableOnline: true
    });
    setEditingAppointmentType(null);
    setShowFormModal(false);
  };

  const handleAddNewClick = () => {
    resetForm();
    setShowFormModal(true);
  };

  const handleEditClick = (appointmentType: AppointmentTypeData) => {
    setFormData({
      name: appointmentType.name,
      minutes: appointmentType.duration,
      bookableOnline: appointmentType.bookableOnline ?? true
    });
    setEditingAppointmentType(appointmentType);
    setShowFormModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      toast.error('Please enter an appointment type name');
      return;
    }
    
    if (formData.minutes <= 0) {
      toast.error('Duration must be greater than 0 minutes');
      return;
    }

    setIsLoading(true);
    try {
      const url = editingAppointmentType 
        ? `/api/practice-config/appointment-types/${editingAppointmentType.id}`
        : '/api/practice-config/appointment-types';
      
      const method = editingAppointmentType ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          minutes: formData.minutes,
          bookableOnline: formData.bookableOnline
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save appointment type');
      }

      toast.success(editingAppointmentType ? 'Appointment type updated successfully!' : 'Appointment type created successfully!');
      resetForm();
      onUpdate(); // Refresh parent data
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save appointment type');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = async (appointmentType: AppointmentTypeData) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${appointmentType.name}"?\n\nThis action cannot be undone and may affect existing availability configurations.`
    );
    
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/practice-config/appointment-types/${appointmentType.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete appointment type');
      }

      toast.success('Appointment type deleted successfully!');
      onUpdate(); // Refresh parent data
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete appointment type');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatSyncStatus = (appointmentType: AppointmentTypeData) => {
    if (appointmentType.lastSyncError) {
      return (
        <div className="text-xs text-red-600 mt-1">
          <span className="font-medium">Sync Error:</span> {appointmentType.lastSyncError}
        </div>
      );
    }
    return (
      <div className="text-xs text-green-600 mt-1">
        ✓ Synced with NexHealth
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Appointment Types Management</h3>
          <p className="text-sm text-gray-600">
            Manage your appointment types, including duration and online booking settings.
          </p>
        </div>
        <button
          onClick={handleAddNewClick}
          disabled={isLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Add New Appointment Type
        </button>
      </div>

      {/* Appointment Types List */}
      {appointmentTypes.length > 0 ? (
        <div className="space-y-4">
          {appointmentTypes.map((appointmentType) => (
            <div 
              key={appointmentType.id}
              className="border border-gray-200 rounded-md p-4 hover:bg-gray-50"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-gray-900">{appointmentType.name}</h4>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {appointmentType.duration} min
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      appointmentType.bookableOnline 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {appointmentType.bookableOnline ? 'Online Booking' : 'Office Only'}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    <span>NexHealth ID: {appointmentType.nexhealthAppointmentTypeId}</span>
                    {appointmentType.parentType && (
                      <span className="ml-4">Parent: {appointmentType.parentType}</span>
                    )}
                  </div>
                  
                  {formatSyncStatus(appointmentType)}
                </div>
                
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEditClick(appointmentType)}
                    disabled={isLoading}
                    className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteClick(appointmentType)}
                    disabled={isLoading}
                    className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">No appointment types found.</p>
          <p className="text-sm text-gray-500">
            Add your first appointment type to start managing scheduling options.
          </p>
        </div>
      )}

      {/* Form Modal */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                {editingAppointmentType ? 'Edit Appointment Type' : 'Add New Appointment Type'}
              </h3>
              
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {/* Name Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Cleaning, Exam, Root Canal"
                    required
                    disabled={isLoading}
                  />
                </div>

                {/* Duration Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (minutes) *
                  </label>
                  <input
                    type="number"
                    value={formData.minutes}
                    onChange={(e) => setFormData(prev => ({ ...prev, minutes: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="480"
                    required
                    disabled={isLoading}
                  />
                </div>

                {/* Bookable Online Field */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="bookableOnline"
                    checked={formData.bookableOnline}
                    onChange={(e) => setFormData(prev => ({ ...prev, bookableOnline: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    disabled={isLoading}
                  />
                  <label htmlFor="bookableOnline" className="ml-2 text-sm text-gray-700">
                    Allow online booking
                  </label>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Saving...' : 'Save'}
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