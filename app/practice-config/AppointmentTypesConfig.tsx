"use client";

import { useState } from "react";
import { toast } from "sonner";

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  bookableOnline: boolean | null;
  groupCode: string | null;
  keywords: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AppointmentTypesConfigProps {
  initialAppointmentTypes: AppointmentType[];
  onUpdate: () => void;
}

interface FormData {
  name: string;
  minutes: number;
  bookableOnline: boolean;
  groupCode: string;
  keywords: string;
}

export function AppointmentTypesConfig({ 
  initialAppointmentTypes, 
  onUpdate 
}: AppointmentTypesConfigProps) {
  const [appointmentTypes] = useState<AppointmentType[]>(initialAppointmentTypes);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingType, setEditingType] = useState<AppointmentType | null>(null);
  const [deletingType, setDeletingType] = useState<AppointmentType | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    minutes: 30,
    bookableOnline: true,
    groupCode: '',
    keywords: ''
  });

  const resetForm = () => {
    setFormData({
      name: '',
      minutes: 30,
      bookableOnline: true,
      groupCode: '',
      keywords: ''
    });
  };

  const handleErrorResponse = (errorData: { error?: string; details?: string | Array<{ path: string[], message: string }> }): string => {
    let errorMessage = errorData.error || 'Unknown operation failed';
    
    // If there are validation details, include them
    if (errorData.details && Array.isArray(errorData.details)) {
      const detailMessages = errorData.details.map((d: { path: string[], message: string }) => 
        `${d.path.join('.')}: ${d.message}`
      ).join('; ');
      errorMessage += ` (${detailMessages})`;
    }
    
    // If there are additional details, include them
    if (errorData.details && typeof errorData.details === 'string') {
      errorMessage += ` - ${errorData.details}`;
    }
    
    return errorMessage;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic client-side validation
    if (!formData.name.trim()) {
      toast.error('Appointment type name is required');
      return;
    }
    
    if (formData.minutes < 5 || formData.minutes > 480) {
      toast.error('Duration must be between 5 minutes and 8 hours');
      return;
    }
    
    setFormLoading(true);
    
    try {
      const response = await fetch('/api/practice-config/appointment-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          minutes: formData.minutes,
          bookableOnline: formData.bookableOnline,
          groupCode: formData.groupCode.trim() || null,
          keywords: formData.keywords.trim() || null
        })
      });

      if (response.ok) {
        toast.success('Appointment type created successfully and synced to NexHealth!');
        setShowCreateModal(false);
        resetForm();
        onUpdate();
      } else {
        const errorData = await response.json();
        const errorMessage = handleErrorResponse(errorData);
        toast.error(`Failed to create: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error creating appointment type:', error);
      toast.error('Network error while creating appointment type. Please check your connection and try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingType) return;
    
    // Basic client-side validation
    if (!formData.name.trim()) {
      toast.error('Appointment type name is required');
      return;
    }
    
    if (formData.minutes < 5 || formData.minutes > 480) {
      toast.error('Duration must be between 5 minutes and 8 hours');
      return;
    }
    
    setFormLoading(true);
    
    try {
      const response = await fetch(`/api/practice-config/appointment-types/${editingType.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          minutes: formData.minutes,
          bookableOnline: formData.bookableOnline,
          groupCode: formData.groupCode.trim() || null,
          keywords: formData.keywords.trim() || null
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.warning) {
          toast.success(`Appointment type updated successfully! ${result.warning}`);
        } else {
          toast.success('Appointment type updated successfully and synced to NexHealth!');
        }
        setShowEditModal(false);
        setEditingType(null);
        resetForm();
        onUpdate();
      } else {
        const errorData = await response.json();
        const errorMessage = handleErrorResponse(errorData);
        toast.error(`Failed to update: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error updating appointment type:', error);
      toast.error('Network error while updating appointment type. Please check your connection and try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingType) return;
    
    setFormLoading(true);
    
    try {
      const response = await fetch(`/api/practice-config/appointment-types/${deletingType.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Appointment type deleted successfully from both Laine and NexHealth!');
        setShowDeleteModal(false);
        setDeletingType(null);
        onUpdate();
      } else {
        const errorData = await response.json();
        const errorMessage = handleErrorResponse(errorData);
        toast.error(`Failed to delete: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error deleting appointment type:', error);
      toast.error('Network error while deleting appointment type. Please check your connection and try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const openEditModal = (type: AppointmentType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      minutes: type.duration,
      bookableOnline: type.bookableOnline ?? true,
      groupCode: type.groupCode || '',
      keywords: type.keywords || ''
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (type: AppointmentType) => {
    setDeletingType(type);
    setShowDeleteModal(true);
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setEditingType(null);
    setDeletingType(null);
    resetForm();
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold">Appointment Types Configuration</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage appointment types directly in Laine. Changes are automatically synced to NexHealth.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Add New Type
        </button>
      </div>

      {/* Appointment Types Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                NexHealth ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Group Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Keywords
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bookable Online
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sync Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {appointmentTypes.map((type) => (
              <tr key={type.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {type.nexhealthAppointmentTypeId}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {type.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {type.duration} minutes
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {type.groupCode || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={type.keywords || undefined}>
                  {type.keywords || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    type.bookableOnline 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {type.bookableOnline ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {type.lastSyncError ? (
                    <span 
                      className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 cursor-help"
                      title={`Sync Error: ${type.lastSyncError}`}
                    >
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Error
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Synced
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <button
                    onClick={() => openEditModal(type)}
                    className="text-blue-600 hover:text-blue-900 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openDeleteModal(type)}
                    className="text-red-600 hover:text-red-900 transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {appointmentTypes.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <div className="mb-2">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-900 mb-1">No appointment types configured</p>
            <p className="text-gray-500">Click &quot;Add New Type&quot; to create your first appointment type.</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Add New Appointment Type</h3>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (minutes) *
                  </label>
                  <select
                    required
                    value={formData.minutes}
                    onChange={(e) => setFormData({ ...formData, minutes: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={75}>75 minutes</option>
                    <option value={90}>90 minutes</option>
                    <option value={105}>105 minutes</option>
                    <option value={120}>120 minutes</option>
                    <option value={150}>150 minutes</option>
                    <option value={180}>180 minutes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Group Code
                  </label>
                  <input
                    type="text"
                    value={formData.groupCode}
                    onChange={(e) => setFormData({ ...formData, groupCode: e.target.value })}
                    placeholder="e.g., CLEANING, EXAM, XRAY"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional: Used for categorizing appointment types in Laine</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keywords
                  </label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="cleaning, checkup, routine"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional: Comma-separated keywords to help Laine AI match patient requests</p>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="bookableOnline"
                    checked={formData.bookableOnline}
                    onChange={(e) => setFormData({ ...formData, bookableOnline: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="bookableOnline" className="ml-2 block text-sm text-gray-700">
                    Bookable Online
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModals}
                  disabled={formLoading}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {formLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit Appointment Type</h3>
            {editingType.lastSyncError && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">Sync Warning</h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>This appointment type has a sync error with NexHealth:</p>
                      <p className="mt-1 font-mono text-xs bg-yellow-100 p-2 rounded">{editingType.lastSyncError}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <form onSubmit={handleEdit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (minutes) *
                  </label>
                  <select
                    required
                    value={formData.minutes}
                    onChange={(e) => setFormData({ ...formData, minutes: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={75}>75 minutes</option>
                    <option value={90}>90 minutes</option>
                    <option value={105}>105 minutes</option>
                    <option value={120}>120 minutes</option>
                    <option value={150}>150 minutes</option>
                    <option value={180}>180 minutes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Group Code
                  </label>
                  <input
                    type="text"
                    value={formData.groupCode}
                    onChange={(e) => setFormData({ ...formData, groupCode: e.target.value })}
                    placeholder="e.g., CLEANING, EXAM, XRAY"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional: Used for categorizing appointment types in Laine</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keywords
                  </label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="cleaning, checkup, routine"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional: Comma-separated keywords to help Laine AI match patient requests</p>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="editBookableOnline"
                    checked={formData.bookableOnline}
                    onChange={(e) => setFormData({ ...formData, bookableOnline: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="editBookableOnline" className="ml-2 block text-sm text-gray-700">
                    Bookable Online
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModals}
                  disabled={formLoading}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {formLoading ? 'Updating...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Delete Appointment Type</h3>
            <div className="mb-6">
              <p className="text-gray-600 mb-3">
                Are you sure you want to delete <strong>&quot;{deletingType.name}&quot;</strong>?
              </p>
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Warning</h3>
                    <div className="mt-2 text-sm text-red-700">
                      This action cannot be undone. The appointment type will be deleted from both Laine and NexHealth.
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModals}
                disabled={formLoading}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={formLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {formLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 