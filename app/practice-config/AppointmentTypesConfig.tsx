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
  const [syncLoading, setSyncLoading] = useState(false);
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

  const handleSyncWithNexHealth = async () => {
    setSyncLoading(true);
    try {
      const response = await fetch('/api/sync-nexhealth', {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('Appointment types synced with NexHealth successfully!');
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(`Sync failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error syncing with NexHealth:', error);
      toast.error('Failed to sync with NexHealth');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    
    try {
      const response = await fetch('/api/practice-config/appointment-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          minutes: formData.minutes,
          bookableOnline: formData.bookableOnline,
          groupCode: formData.groupCode || null,
          keywords: formData.keywords || null
        })
      });

      if (response.ok) {
        toast.success('Appointment type created successfully!');
        setShowCreateModal(false);
        resetForm();
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(`Failed to create: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating appointment type:', error);
      toast.error('Failed to create appointment type');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingType) return;
    
    setFormLoading(true);
    
    try {
      const response = await fetch(`/api/practice-config/appointment-types/${editingType.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          minutes: formData.minutes,
          bookableOnline: formData.bookableOnline,
          groupCode: formData.groupCode || null,
          keywords: formData.keywords || null
        })
      });

      if (response.ok) {
        toast.success('Appointment type updated successfully!');
        setShowEditModal(false);
        setEditingType(null);
        resetForm();
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(`Failed to update: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating appointment type:', error);
      toast.error('Failed to update appointment type');
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
        toast.success('Appointment type deleted successfully!');
        setShowDeleteModal(false);
        setDeletingType(null);
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(`Failed to delete: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting appointment type:', error);
      toast.error('Failed to delete appointment type');
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
        <h2 className="text-xl font-semibold">Appointment Types Configuration</h2>
        <div className="flex gap-3">
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Add New Type
          </button>
          <button
            onClick={handleSyncWithNexHealth}
            disabled={syncLoading}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncLoading ? 'Syncing...' : 'Sync with NexHealth'}
          </button>
        </div>
      </div>

      {/* Appointment Types Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
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
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {appointmentTypes.map((type) => (
              <tr key={type.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {type.id}
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <button
                    onClick={() => openEditModal(type)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openDeleteModal(type)}
                    className="text-red-600 hover:text-red-900"
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
            No appointment types configured. Add a new type or sync with NexHealth to import them.
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
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
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keywords
                  </label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="Enter comma-separated keywords like: jaw pain, emergency exam"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
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
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Appointment Type</h3>
            <form onSubmit={handleEdit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
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
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keywords
                  </label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="Enter comma-separated keywords like: jaw pain, emergency exam"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
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
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete &quot;{deletingType.name}&quot;? This action cannot be undone and will also remove it from NexHealth.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModals}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={formLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
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