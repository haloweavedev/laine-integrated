"use client";

import { useState } from "react";
import { toast } from "sonner";

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

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  bookableOnline: boolean | null;
  groupCode: string | null;
}

interface SavedOperatory {
  id: string;
  nexhealthOperatoryId: string;
  name: string;
  isActive: boolean;
}

interface ProviderSettings {
  acceptedAppointmentTypeIds: string[];
  defaultAppointmentTypeId: string | null;
  defaultOperatoryId: string | null;
}

interface ProvidersConfigProps {
  savedProviders: SavedProvider[];
  allAppointmentTypes: AppointmentType[];
  allOperatories: SavedOperatory[];
  onUpdate: () => void;
}

export function ProvidersConfig({
  savedProviders,
  allAppointmentTypes,
  allOperatories,
  onUpdate
}: ProvidersConfigProps) {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerSettings, setProviderSettings] = useState<{ [key: string]: ProviderSettings }>({});
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [fetchingSettings, setFetchingSettings] = useState<{ [key: string]: boolean }>({});

  const activeProviders = savedProviders.filter(sp => sp.isActive);

  const fetchProviderSettings = async (savedProviderId: string) => {
    setFetchingSettings(prev => ({ ...prev, [savedProviderId]: true }));
    try {
      const response = await fetch(`/api/practice-config/provider-settings/${savedProviderId}`);
      if (response.ok) {
        const settings = await response.json();
        setProviderSettings(prev => ({
          ...prev,
          [savedProviderId]: {
            acceptedAppointmentTypeIds: settings.acceptedAppointmentTypes?.map((at: { appointmentTypeId: string }) => at.appointmentTypeId) || [],
            defaultAppointmentTypeId: settings.defaultAppointmentTypeId,
            defaultOperatoryId: settings.defaultOperatoryId
          }
        }));
      } else {
        // Initialize with empty settings if none exist
        setProviderSettings(prev => ({
          ...prev,
          [savedProviderId]: {
            acceptedAppointmentTypeIds: [],
            defaultAppointmentTypeId: null,
            defaultOperatoryId: null
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching provider settings:', error);
      toast.error('Failed to fetch provider settings');
    } finally {
      setFetchingSettings(prev => ({ ...prev, [savedProviderId]: false }));
    }
  };

  const handleProviderExpand = async (savedProviderId: string) => {
    if (expandedProvider === savedProviderId) {
      setExpandedProvider(null);
    } else {
      setExpandedProvider(savedProviderId);
      if (!providerSettings[savedProviderId]) {
        await fetchProviderSettings(savedProviderId);
      }
    }
  };

  const updateProviderSetting = (savedProviderId: string, field: keyof ProviderSettings, value: string | string[] | null) => {
    setProviderSettings(prev => ({
      ...prev,
      [savedProviderId]: {
        ...prev[savedProviderId],
        [field]: value
      }
    }));
  };

  const handleAcceptedTypesChange = (savedProviderId: string, appointmentTypeId: string, checked: boolean) => {
    const currentSettings = providerSettings[savedProviderId];
    let newAcceptedTypes: string[];
    
    if (checked) {
      newAcceptedTypes = [...(currentSettings?.acceptedAppointmentTypeIds || []), appointmentTypeId];
    } else {
      newAcceptedTypes = (currentSettings?.acceptedAppointmentTypeIds || []).filter(id => id !== appointmentTypeId);
      // If we're removing the default appointment type, clear it
      if (currentSettings?.defaultAppointmentTypeId === appointmentTypeId) {
        updateProviderSetting(savedProviderId, 'defaultAppointmentTypeId', null);
      }
    }
    
    updateProviderSetting(savedProviderId, 'acceptedAppointmentTypeIds', newAcceptedTypes);
  };

  const saveProviderSettings = async (savedProviderId: string) => {
    const settings = providerSettings[savedProviderId];
    if (!settings) return;

    setLoading(prev => ({ ...prev, [savedProviderId]: true }));
    try {
      const response = await fetch(`/api/practice-config/provider-settings/${savedProviderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptedAppointmentTypeIds: settings.acceptedAppointmentTypeIds,
          defaultAppointmentTypeId: settings.defaultAppointmentTypeId,
          defaultOperatoryId: settings.defaultOperatoryId
        })
      });

      if (response.ok) {
        toast.success('Provider settings saved successfully!');
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(`Failed to save: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving provider settings:', error);
      toast.error('Failed to save provider settings');
    } finally {
      setLoading(prev => ({ ...prev, [savedProviderId]: false }));
    }
  };

  const getProviderName = (provider: Provider) => {
    return `${provider.firstName || ''} ${provider.lastName}`.trim() || 'Unnamed Provider';
  };

  const getAcceptedAppointmentTypes = (savedProviderId: string) => {
    const settings = providerSettings[savedProviderId];
    if (!settings) return [];
    return allAppointmentTypes.filter(at => settings.acceptedAppointmentTypeIds.includes(at.id));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-6">Providers Configuration</h2>
      
      {activeProviders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No active providers found. Please sync with NexHealth and activate providers first.
        </div>
      ) : (
        <div className="space-y-4">
          {activeProviders.map((savedProvider) => (
            <div key={savedProvider.id} className="border border-gray-200 rounded-lg">
              <div
                className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => handleProviderExpand(savedProvider.id)}
              >
                <div>
                  <h3 className="font-medium text-gray-900">
                    {getProviderName(savedProvider.provider)}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Provider ID: {savedProvider.provider.nexhealthProviderId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {expandedProvider === savedProvider.id ? 'Collapse' : 'Configure'}
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${
                      expandedProvider === savedProvider.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {expandedProvider === savedProvider.id && (
                <div className="border-t border-gray-200 p-4">
                  {fetchingSettings[savedProvider.id] ? (
                    <div className="text-center py-4 text-gray-500">Loading settings...</div>
                  ) : (
                    <div className="space-y-6">
                      {/* Accepted Appointment Types */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Accepted Appointment Types</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {allAppointmentTypes.map((appointmentType) => (
                            <label key={appointmentType.id} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={providerSettings[savedProvider.id]?.acceptedAppointmentTypeIds.includes(appointmentType.id) || false}
                                onChange={(e) => handleAcceptedTypesChange(savedProvider.id, appointmentType.id, e.target.checked)}
                                className="mr-2"
                              />
                              <span className="text-sm text-gray-700">
                                {appointmentType.name} ({appointmentType.duration} min)
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Default Appointment Type */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Default Appointment Type</h4>
                        <select
                          value={providerSettings[savedProvider.id]?.defaultAppointmentTypeId || ''}
                          onChange={(e) => updateProviderSetting(savedProvider.id, 'defaultAppointmentTypeId', e.target.value || null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select default appointment type</option>
                          {getAcceptedAppointmentTypes(savedProvider.id).map((appointmentType) => (
                            <option key={appointmentType.id} value={appointmentType.id}>
                              {appointmentType.name} ({appointmentType.duration} min)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Default Operatory */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Default Operatory</h4>
                        <select
                          value={providerSettings[savedProvider.id]?.defaultOperatoryId || ''}
                          onChange={(e) => updateProviderSetting(savedProvider.id, 'defaultOperatoryId', e.target.value || null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select default operatory</option>
                          {allOperatories.filter(op => op.isActive).map((operatory) => (
                            <option key={operatory.id} value={operatory.id}>
                              {operatory.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Save Button */}
                      <div className="flex justify-end pt-4">
                        <button
                          onClick={() => saveProviderSettings(savedProvider.id)}
                          disabled={loading[savedProvider.id]}
                          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading[savedProvider.id] ? 'Saving...' : 'Save Settings'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 