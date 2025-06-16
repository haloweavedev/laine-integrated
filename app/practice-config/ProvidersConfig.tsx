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
  assignedOperatoryIds: string[];
}

interface ProvidersConfigProps {
  savedProviders: SavedProvider[];
  allProviders: Provider[]; // Add raw providers
  allAppointmentTypes: AppointmentType[];
  allOperatories: SavedOperatory[];
  onUpdate: () => void;
}

export function ProvidersConfig({
  savedProviders,
  allProviders,
  allAppointmentTypes,
  allOperatories,
  onUpdate
}: ProvidersConfigProps) {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerSettings, setProviderSettings] = useState<{ [key: string]: ProviderSettings }>({});
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [fetchingSettings, setFetchingSettings] = useState<{ [key: string]: boolean }>({});
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [activationLoading, setActivationLoading] = useState(false);

  const activeProviders = savedProviders.filter(sp => sp.isActive);
  
  // Get unactivated providers (exist in allProviders but not in savedProviders)
  const savedProviderIds = new Set(savedProviders.map(sp => sp.providerId));
  const unactivatedProviders = allProviders.filter(p => !savedProviderIds.has(p.id));

  const fetchProviderSettings = async (savedProviderId: string) => {
    setFetchingSettings(prev => ({ ...prev, [savedProviderId]: true }));
    try {
      const response = await fetch(`/api/practice-config/provider-settings/${savedProviderId}`);
      if (response.ok) {
        const settings = await response.json();
        setProviderSettings(prev => ({
          ...prev,
          [savedProviderId]: {
            acceptedAppointmentTypeIds: Array.isArray(settings.acceptedAppointmentTypes) ? settings.acceptedAppointmentTypes.map((at: { id: string }) => at.id) : [],
            assignedOperatoryIds: Array.isArray(settings.assignedOperatories) ? settings.assignedOperatories.map((op: { id: string }) => op.id) : []
          }
        }));
      } else {
        // Initialize with empty settings if none exist
        setProviderSettings(prev => ({
          ...prev,
          [savedProviderId]: {
            acceptedAppointmentTypeIds: [],
            assignedOperatoryIds: []
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
    }
    
    updateProviderSetting(savedProviderId, 'acceptedAppointmentTypeIds', newAcceptedTypes);
  };

  const handleOperatoryAssignmentChange = (savedProviderId: string, operatoryId: string, checked: boolean) => {
    const currentSettings = providerSettings[savedProviderId];
    let newAssignedOperatories: string[];
    
    if (checked) {
      newAssignedOperatories = [...(currentSettings?.assignedOperatoryIds || []), operatoryId];
    } else {
      newAssignedOperatories = (currentSettings?.assignedOperatoryIds || []).filter(id => id !== operatoryId);
    }
    
    updateProviderSetting(savedProviderId, 'assignedOperatoryIds', newAssignedOperatories);
  };

  const saveProviderSettings = async (savedProviderId: string) => {
    const settings = providerSettings[savedProviderId];
    if (!settings) return;

    // Ensure data types are correct before sending
    const payload = {
      acceptedAppointmentTypeIds: Array.isArray(settings.acceptedAppointmentTypeIds) ? settings.acceptedAppointmentTypeIds : [],
      assignedOperatoryIds: Array.isArray(settings.assignedOperatoryIds) ? settings.assignedOperatoryIds : []
    };

    console.log('🔍 Saving provider settings:', {
      savedProviderId,
      payload,
      payloadTypes: Object.keys(payload).map(key => `${key}: ${typeof payload[key as keyof typeof payload]} (${Array.isArray(payload[key as keyof typeof payload]) ? 'array' : 'not array'})`)
    });

    setLoading(prev => ({ ...prev, [savedProviderId]: true }));
    try {
      const response = await fetch(`/api/practice-config/provider-settings/${savedProviderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success('Provider settings saved successfully!');
        onUpdate();
      } else {
        const error = await response.json();
        console.error('❌ API Error Response:', error);
        
        // Show more detailed error information
        if (error.issues && Array.isArray(error.issues)) {
          const errorMessages = error.issues.map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`).join(', ');
          toast.error(`Validation failed: ${errorMessages}`);
        } else {
          toast.error(`Failed to save: ${error.error || 'Unknown error'}`);
        }
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



  const handleSyncNexHealth = async () => {
    setSyncLoading(true);
    try {
      const response = await fetch('/api/sync-nexhealth', {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Successfully synced ${result.data.providersCount} providers and ${result.data.operatoriesCount} operatories!`);
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

  const handleProviderSelection = (providerId: string, checked: boolean) => {
    setSelectedProviders(prev => 
      checked 
        ? [...prev, providerId]
        : prev.filter(id => id !== providerId)
    );
  };

  const handleActivateProviders = async () => {
    if (selectedProviders.length === 0) {
      toast.error('Please select at least one provider to activate');
      return;
    }

    setActivationLoading(true);
    try {
      const response = await fetch('/api/practice-config/providers/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerIds: selectedProviders })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Successfully activated ${result.activatedProviders} provider(s)!`);
        setSelectedProviders([]);
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(`Activation failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error activating providers:', error);
      toast.error('Failed to activate providers');
    } finally {
      setActivationLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Providers Configuration</h2>
        <button
          onClick={handleSyncNexHealth}
          disabled={syncLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {syncLoading ? 'Syncing...' : 'Sync from NexHealth'}
        </button>
      </div>
      
      {activeProviders.length === 0 ? (
        <div className="space-y-6">
          {unactivatedProviders.length > 0 ? (
            <>
              <div className="text-center py-4">
                <p className="text-gray-600 mb-4">
                  Found {unactivatedProviders.length} provider(s) from NexHealth. Select providers to activate:
                </p>
              </div>
              
              <div className="space-y-3">
                {unactivatedProviders.map((provider) => (
                  <label key={provider.id} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedProviders.includes(provider.id)}
                      onChange={(e) => handleProviderSelection(provider.id, e.target.checked)}
                      className="mr-3"
                    />
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">
                        {getProviderName(provider)}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Provider ID: {provider.nexhealthProviderId}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              
              {selectedProviders.length > 0 && (
                <div className="flex justify-center">
                  <button
                    onClick={handleActivateProviders}
                    disabled={activationLoading}
                    className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {activationLoading ? 'Activating...' : `Activate ${selectedProviders.length} Provider(s)`}
                  </button>
                </div>
              )}
            </>
          ) : allProviders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-4">No providers found. Please sync with NexHealth first.</p>
              <button
                onClick={handleSyncNexHealth}
                disabled={syncLoading}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncLoading ? 'Syncing...' : 'Sync from NexHealth'}
              </button>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>All providers have been synced but none are activated.</p>
            </div>
          )}
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



                      {/* Assigned Operatories */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Assigned Operatories</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {allOperatories.filter(op => op.isActive).map((operatory) => (
                            <label key={operatory.id} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={providerSettings[savedProvider.id]?.assignedOperatoryIds.includes(operatory.id) || false}
                                onChange={(e) => handleOperatoryAssignmentChange(savedProvider.id, operatory.id, e.target.checked)}
                                className="mr-2"
                              />
                              <span className="text-sm text-gray-700">
                                {operatory.name} (ID: {operatory.nexhealthOperatoryId})
                              </span>
                            </label>
                          ))}
                        </div>
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