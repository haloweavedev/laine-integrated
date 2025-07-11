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
  spokenName: string | null;
  check_immediate_next_available: boolean;
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
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
            Active in Laine
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
            Inactive in Laine
          </span>
        );
      case 'unconfigured':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
            Not Configured
          </span>
        );
    }
  };

  const getActionButtonText = (status: ProviderStatus) => {
    switch (status) {
      case 'active':
        return 'Edit Settings';
      case 'inactive':
        return 'Reactivate';
      case 'unconfigured':
        return 'Configure';
    }
  };

  const getActionButtonStyle = (status: ProviderStatus) => {
    switch (status) {
      case 'active':
        return "inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
      case 'inactive':
        return "inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
      case 'unconfigured':
        return "inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
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

        const result = await response.json();
        toast.success(`Provider activated successfully! ${result.message || ''}`);
        
        // Refresh data to get the new SavedProvider record
        onUpdate();
        
        // Initialize default settings for new provider (active with no assignments)
        // The user will need to configure operatories before the provider can be truly active
        setProviderSettings(prev => ({
          ...prev,
          [provider.id]: {
            acceptedAppointmentTypeIds: [],
            assignedOperatoryIds: [],
            isActive: true
          }
        }));
        
        // Expand to show settings immediately
        setExpandedProvider(provider.id);
        
      } catch (error) {
        console.error('Error activating provider:', error);
        toast.error('Failed to activate provider');
      } finally {
        setLoading(prev => ({ ...prev, [provider.id]: false }));
      }
    } else if (savedProvider) {
      // For existing providers, fetch their settings and expand
      await fetchProviderSettings(savedProvider.id);
      setExpandedProvider(provider.id);
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
    const currentSettings = providerSettings[settingsKey] || { acceptedAppointmentTypeIds: [], assignedOperatoryIds: [] };
    const currentTypes = currentSettings.acceptedAppointmentTypeIds || [];
    
    const updatedTypes = checked 
      ? [...currentTypes, appointmentTypeId]
      : currentTypes.filter(id => id !== appointmentTypeId);
    
    updateProviderSetting(settingsKey, 'acceptedAppointmentTypeIds', updatedTypes);
  };

  const handleOperatoryAssignmentChange = (settingsKey: string, operatoryId: string, checked: boolean) => {
    const currentSettings = providerSettings[settingsKey] || { acceptedAppointmentTypeIds: [], assignedOperatoryIds: [] };
    const currentOperatories = currentSettings.assignedOperatoryIds || [];
    
    const updatedOperatories = checked 
      ? [...currentOperatories, operatoryId]
      : currentOperatories.filter(id => id !== operatoryId);
    
    updateProviderSetting(settingsKey, 'assignedOperatoryIds', updatedOperatories);
  };

  // Enhanced error handling function
  const handleErrorResponse = (errorData: { error?: string; details?: string | Array<{ path: string[], message: string }>; code?: string }): string => {
    let errorMessage = errorData.error || 'Unknown operation failed';
    
    // Handle specific error codes
    if (errorData.code === 'MANDATORY_OPERATORY_REQUIRED') {
      return errorData.error || 'Active providers must have at least one operatory assigned';
    }
    
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

  // Client-side validation
  const validateProviderSettings = (settings: ProviderSettings): { isValid: boolean; error?: string } => {
    // Check if provider is being set to active without operatories
    if (settings.isActive === true && (!settings.assignedOperatoryIds || settings.assignedOperatoryIds.length === 0)) {
      return { 
        isValid: false, 
        error: 'Active providers must be assigned at least one operatory. Please select at least one operatory before activating this provider.' 
      };
    }
    
    return { isValid: true };
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

    // Client-side validation
    const validation = validateProviderSettings(settings);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid settings');
      return;
    }

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
        const result = await response.json();
        toast.success(result.message || 'Provider settings saved successfully!');
        onUpdate();
        setExpandedProvider(null);
      } else {
        const error = await response.json();
        console.error('❌ API Error Response:', error);
        
        const errorMessage = handleErrorResponse(error);
        toast.error(errorMessage);
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
        const details = result.data?.details;
        let successMessage = `Successfully synced ${result.data.providersCount} providers and ${result.data.operatoriesCount} operatories!`;
        
        if (details) {
          successMessage += ` (Providers: ${details.providers.created} new, ${details.providers.updated} updated; Operatories: ${details.operatories.created} new, ${details.operatories.updated} updated)`;
        }
        
        toast.success(successMessage);
        onUpdate();
      } else {
        const error = await response.json();
        const errorMessage = handleErrorResponse(error);
        toast.error(`Sync failed: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error syncing with NexHealth:', error);
      toast.error('Failed to sync with NexHealth');
    } finally {
      setSyncLoading(false);
    }
  };

  // Check if save button should be disabled
  const isSaveDisabled = (settingsKey: string): boolean => {
    const settings = providerSettings[settingsKey];
    if (!settings) return false;
    
    // Disable if provider is set to active but has no operatories assigned
    return settings.isActive === true && (!settings.assignedOperatoryIds || settings.assignedOperatoryIds.length === 0);
  };

  const renderProviderSettings = (providerWithStatus: ProviderWithStatus) => {
    const { provider, savedProvider } = providerWithStatus;
    if (!savedProvider) return null;
    
    const settingsKey = savedProvider.id;
    
    if (fetchingSettings[settingsKey]) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-slate-600">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
            <span className="text-sm font-medium">Loading settings...</span>
          </div>
        </div>
      );
    }

    const isActiveProvider = providerSettings[settingsKey]?.isActive === true;
    const hasOperatories = providerSettings[settingsKey]?.assignedOperatoryIds?.length > 0;
    const showOperatoryWarning = isActiveProvider && !hasOperatories;

    return (
      <div className="space-y-8">
        {/* Laine Status Toggle */}
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">Laine Status</h4>
              <p className="text-xs text-slate-600">Control whether this provider is available for AI scheduling in Laine</p>
              {showOperatoryWarning && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-xs font-medium text-amber-800">Operatory Assignment Required</p>
                      <p className="text-xs text-amber-700">Active providers must be assigned at least one operatory to be available for scheduling.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={providerSettings[settingsKey]?.isActive ?? true}
                onChange={(e) => updateProviderSetting(settingsKey, 'isActive', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              <span className="ml-3 text-sm font-medium text-slate-700">
                {providerSettings[settingsKey]?.isActive ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>
        </div>

        {/* Accepted Appointment Types */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200">
            <h4 className="text-sm font-semibold text-slate-900 mb-1">Accepted Appointment Types</h4>
            <p className="text-xs text-slate-600">Select which appointment types this provider can handle</p>
          </div>
          <div className="p-6">
            {allAppointmentTypes.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm text-slate-500 mb-2">No appointment types available</p>
                <p className="text-xs text-slate-400">Create appointment types first to assign them to providers</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allAppointmentTypes.map((appointmentType) => (
                  <label key={appointmentType.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all duration-200">
                    <input
                      type="checkbox"
                      checked={providerSettings[settingsKey]?.acceptedAppointmentTypeIds.includes(appointmentType.id) || false}
                      onChange={(e) => handleAcceptedTypesChange(settingsKey, appointmentType.id, e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900 block">{appointmentType.name}</span>
                      <span className="text-xs text-slate-500">{appointmentType.duration} minutes</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Assigned Operatories */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-200">
            <h4 className="text-sm font-semibold text-slate-900 mb-1">Assigned Operatories</h4>
            <p className="text-xs text-slate-600">Choose which operatories this provider can use for appointments</p>
          </div>
          <div className="p-6">
            {allOperatories.filter(op => op.isActive).length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H9m0 0H5m0 0h2M7 8h10M7 12h4m1 8l2-2 2 2" />
                </svg>
                <p className="text-sm text-slate-500 mb-2">No active operatories available</p>
                <p className="text-xs text-slate-400">Sync with NexHealth to import operatories, then activate them for assignment</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allOperatories.filter(op => op.isActive).map((operatory) => (
                  <label key={operatory.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer transition-all duration-200">
                    <input
                      type="checkbox"
                      checked={providerSettings[settingsKey]?.assignedOperatoryIds.includes(operatory.id) || false}
                      onChange={(e) => handleOperatoryAssignmentChange(settingsKey, operatory.id, e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-emerald-600 bg-white border-slate-300 rounded focus:ring-emerald-500 focus:ring-2"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900 block">{operatory.name}</span>
                      <span className="text-xs text-slate-500">ID: {operatory.nexhealthOperatoryId}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200">
          <button
            onClick={() => setExpandedProvider(null)}
            className="inline-flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            Cancel
          </button>
          <button
            onClick={() => saveProviderSettings(providerWithStatus)}
            disabled={loading[provider.id] || isSaveDisabled(settingsKey)}
            className={`inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
              isSaveDisabled(settingsKey) 
                ? 'bg-slate-400 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            title={isSaveDisabled(settingsKey) ? 'Please assign at least one operatory to activate this provider' : ''}
          >
            {loading[provider.id] ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Providers Configuration</h2>
            <p className="text-sm text-slate-600 mt-1">
              Manage your practice providers and their Laine settings
            </p>
          </div>
          <button
            onClick={handleSyncNexHealth}
            disabled={syncLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync from NexHealth
              </>
            )}
          </button>
        </div>
      </div>

      {/* Provider List */}
      <div className="p-8">
        {providersWithStatus.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No providers found</h3>
            <p className="text-slate-600 mb-6">Sync with NexHealth to import your providers</p>
            <button
              onClick={handleSyncNexHealth}
              disabled={syncLoading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync from NexHealth
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {providersWithStatus.map((providerWithStatus) => {
              const { provider, status } = providerWithStatus;
              const isExpanded = expandedProvider === provider.id;
              
              return (
                <div key={provider.id} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-lg font-semibold text-slate-900">
                            {getProviderName(provider)}
                          </h3>
                          {getStatusBadge(status)}
                        </div>
                        <p className="text-sm text-slate-500 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V4a2 2 0 114 0v2m-4 0a2 2 0 104 0m-4 0v2m0 0h4" />
                          </svg>
                          Provider ID: {provider.nexhealthProviderId}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {isExpanded && (
                          <button
                            onClick={() => setExpandedProvider(null)}
                            className="inline-flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors duration-200"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                            Collapse
                          </button>
                        )}
                        <button
                          onClick={() => handleProviderConfigure(providerWithStatus)}
                          disabled={loading[provider.id]}
                          className={getActionButtonStyle(status)}
                        >
                          {loading[provider.id] ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Loading...
                            </>
                          ) : (
                            <>
                              {status === 'active' && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              )}
                              {status === 'inactive' && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              )}
                              {status === 'unconfigured' && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              )}
                              {getActionButtonText(status)}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Settings */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50">
                      <div className="p-8">
                        {renderProviderSettings(providerWithStatus)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
} 