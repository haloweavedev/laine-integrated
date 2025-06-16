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
  isActive?: boolean;
}

interface ProvidersConfigProps {
  savedProviders: SavedProvider[];
  allProviders: Provider[];
  allAppointmentTypes: AppointmentType[];
  allOperatories: SavedOperatory[];
  onUpdate: () => void;
}

type ProviderStatus = 'unconfigured' | 'active' | 'inactive';

interface ProviderWithStatus {
  provider: Provider;
  status: ProviderStatus;
  savedProvider?: SavedProvider;
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
  const [syncLoading, setSyncLoading] = useState(false);

  // Create unified provider list with status
  const savedProviderMap = new Map(savedProviders.map(sp => [sp.providerId, sp]));
  
  const providersWithStatus: ProviderWithStatus[] = allProviders.map(provider => {
    const savedProvider = savedProviderMap.get(provider.id);
    let status: ProviderStatus = 'unconfigured';
    
    if (savedProvider) {
      status = savedProvider.isActive ? 'active' : 'inactive';
    }
    
    return {
      provider,
      status,
      savedProvider
    };
  });

  const getProviderName = (provider: Provider) => {
    return `${provider.firstName || ''} ${provider.lastName}`.trim() || 'Unnamed Provider';
  };

  const getStatusBadge = (status: ProviderStatus) => {
    switch (status) {
      case 'active':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>;
      case 'inactive':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Inactive</span>;
      case 'unconfigured':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Unconfigured</span>;
    }
  };

  const getActionButtonText = (status: ProviderStatus) => {
    switch (status) {
      case 'active':
        return 'Edit Settings';
      case 'inactive':
        return 'Re-configure & Activate';
      case 'unconfigured':
        return 'Configure';
    }
  };

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
            assignedOperatoryIds: Array.isArray(settings.assignedOperatories) ? settings.assignedOperatories.map((op: { id: string }) => op.id) : [],
            isActive: settings.isActive
          }
        }));
      } else {
        // Initialize with empty settings if none exist
        setProviderSettings(prev => ({
          ...prev,
          [savedProviderId]: {
            acceptedAppointmentTypeIds: [],
            assignedOperatoryIds: [],
            isActive: true
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

  const handleProviderConfigure = async (providerWithStatus: ProviderWithStatus) => {
    const { provider, status, savedProvider } = providerWithStatus;
    
    // If unconfigured, we need to activate first
    if (status === 'unconfigured') {
      try {
        setLoading(prev => ({ ...prev, [provider.id]: true }));
        
        // Activate the provider first
        const response = await fetch('/api/practice-config/providers/activate-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerIds: [provider.id] })
        });

        if (!response.ok) {
          const error = await response.json();
          toast.error(`Failed to activate provider: ${error.error || 'Unknown error'}`);
          return;
        }

        // Refresh data to get the new SavedProvider record
        onUpdate();
        
        // Initialize empty settings for new provider
        setProviderSettings(prev => ({
          ...prev,
          [provider.id]: {
            acceptedAppointmentTypeIds: [],
            assignedOperatoryIds: [],
            isActive: true
          }
        }));
        
        setExpandedProvider(provider.id);
        
      } catch (error) {
        console.error('Error activating provider:', error);
        toast.error('Failed to activate provider');
      } finally {
        setLoading(prev => ({ ...prev, [provider.id]: false }));
      }
    } else if (savedProvider) {
      // For existing saved providers, expand and fetch settings
      const settingsKey = savedProvider.id;
      
      if (expandedProvider === provider.id) {
        setExpandedProvider(null);
      } else {
        setExpandedProvider(provider.id);
        
        // Pre-set isActive to true for inactive providers being re-configured
        if (status === 'inactive') {
          setProviderSettings(prev => ({
            ...prev,
            [settingsKey]: {
              ...prev[settingsKey],
              isActive: true
            }
          }));
        }
        
        if (!providerSettings[settingsKey]) {
          await fetchProviderSettings(settingsKey);
        }
      }
    }
  };

  const updateProviderSetting = (settingsKey: string, field: keyof ProviderSettings, value: string | string[] | boolean | null) => {
    setProviderSettings(prev => ({
      ...prev,
      [settingsKey]: {
        ...prev[settingsKey],
        [field]: value
      }
    }));
  };

  const handleAcceptedTypesChange = (settingsKey: string, appointmentTypeId: string, checked: boolean) => {
    const currentSettings = providerSettings[settingsKey];
    let newAcceptedTypes: string[];
    
    if (checked) {
      newAcceptedTypes = [...(currentSettings?.acceptedAppointmentTypeIds || []), appointmentTypeId];
    } else {
      newAcceptedTypes = (currentSettings?.acceptedAppointmentTypeIds || []).filter(id => id !== appointmentTypeId);
    }
    
    updateProviderSetting(settingsKey, 'acceptedAppointmentTypeIds', newAcceptedTypes);
  };

  const handleOperatoryAssignmentChange = (settingsKey: string, operatoryId: string, checked: boolean) => {
    const currentSettings = providerSettings[settingsKey];
    let newAssignedOperatories: string[];
    
    if (checked) {
      newAssignedOperatories = [...(currentSettings?.assignedOperatoryIds || []), operatoryId];
    } else {
      newAssignedOperatories = (currentSettings?.assignedOperatoryIds || []).filter(id => id !== operatoryId);
    }
    
    updateProviderSetting(settingsKey, 'assignedOperatoryIds', newAssignedOperatories);
  };

  const saveProviderSettings = async (providerWithStatus: ProviderWithStatus) => {
    const { provider, savedProvider } = providerWithStatus;
    
    // For newly activated providers, we need to refresh to get the savedProvider ID
    if (!savedProvider) {
      toast.error('Provider settings cannot be saved. Please try refreshing the page.');
      return;
    }
    
    const settingsKey = savedProvider.id;
    const settings = providerSettings[settingsKey];
    if (!settings) return;

    const payload = {
      acceptedAppointmentTypeIds: Array.isArray(settings.acceptedAppointmentTypeIds) ? settings.acceptedAppointmentTypeIds : [],
      assignedOperatoryIds: Array.isArray(settings.assignedOperatoryIds) ? settings.assignedOperatoryIds : [],
      ...(settings.isActive !== undefined && { isActive: settings.isActive })
    };

    console.log('🔍 Saving provider settings:', { savedProviderId: savedProvider.id, payload });

    setLoading(prev => ({ ...prev, [provider.id]: true }));
    try {
      const response = await fetch(`/api/practice-config/provider-settings/${savedProvider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success('Provider settings saved successfully!');
        onUpdate();
        setExpandedProvider(null);
      } else {
        const error = await response.json();
        console.error('❌ API Error Response:', error);
        
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
      setLoading(prev => ({ ...prev, [provider.id]: false }));
    }
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

  const renderProviderSettings = (providerWithStatus: ProviderWithStatus) => {
    const { provider, savedProvider } = providerWithStatus;
    if (!savedProvider) return null;
    
    const settingsKey = savedProvider.id;
    
    if (fetchingSettings[settingsKey]) {
      return <div className="text-center py-4 text-gray-500">Loading settings...</div>;
    }

    return (
      <div className="space-y-6">
        {/* Laine Status Toggle */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Laine Status</h4>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={providerSettings[settingsKey]?.isActive ?? true}
              onChange={(e) => updateProviderSetting(settingsKey, 'isActive', e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              {providerSettings[settingsKey]?.isActive ? 'Active in Laine' : 'Inactive in Laine'}
            </span>
          </label>
        </div>

        {/* Accepted Appointment Types */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Accepted Appointment Types</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {allAppointmentTypes.map((appointmentType) => (
              <label key={appointmentType.id} className="flex items-center">
                <input
                  type="checkbox"
                  checked={providerSettings[settingsKey]?.acceptedAppointmentTypeIds.includes(appointmentType.id) || false}
                  onChange={(e) => handleAcceptedTypesChange(settingsKey, appointmentType.id, e.target.checked)}
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
                  checked={providerSettings[settingsKey]?.assignedOperatoryIds.includes(operatory.id) || false}
                  onChange={(e) => handleOperatoryAssignmentChange(settingsKey, operatory.id, e.target.checked)}
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
            onClick={() => saveProviderSettings(providerWithStatus)}
            disabled={loading[provider.id]}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading[provider.id] ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    );
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

      {/* Unified Provider List */}
      {providersWithStatus.length === 0 ? (
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
        <div className="space-y-4">
          {providersWithStatus.map((providerWithStatus) => {
            const { provider, status } = providerWithStatus;
            const isExpanded = expandedProvider === provider.id;
            
            return (
              <div key={provider.id} className="border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-medium text-gray-900">
                        {getProviderName(provider)}
                      </h3>
                      {getStatusBadge(status)}
                    </div>
                    <p className="text-sm text-gray-500">
                      Provider ID: {provider.nexhealthProviderId}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => handleProviderConfigure(providerWithStatus)}
                    disabled={loading[provider.id]}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {loading[provider.id] ? 'Loading...' : getActionButtonText(status)}
                  </button>
                </div>

                {/* Expanded Settings Panel */}
                {isExpanded && (
                  <div className="border-t border-gray-200 p-4">
                    {renderProviderSettings(providerWithStatus)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 