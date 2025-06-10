"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Toaster, toast } from "sonner";
import { ProviderSelection } from "./provider-selection";
import { OperatorySelection } from "./operatory-selection";
import { AvailabilityManager } from "./availability-manager";
import { CheckAppointmentSlots } from "./check-appointment-slots";
import { AppointmentTypeManager } from "./appointment-type-manager";

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
  isActive: boolean;
  lastSyncWithNexhealthAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Practice {
  id: string;
  name: string | null;
  nexhealthSubdomain: string | null;
  nexhealthLocationId: string | null;
  webhookLastSyncAt: string | null;
  address: string | null;
  acceptedInsurances: string | null;
  serviceCostEstimates: string | null;
  appointmentTypes: Array<{
    id: string;
    nexhealthAppointmentTypeId: string;
    name: string;
    duration: number;
    bookableOnline: boolean | null;
    parentType: string | null;
    parentId: string | null;
    lastSyncError: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  providers: Array<{
    id: string;
    nexhealthProviderId: string;
    firstName: string | null;
    lastName: string;
  }>;
  savedProviders: Array<{
    id: string;
    providerId: string;
    isDefault: boolean;
    isActive: boolean;
    provider: {
      id: string;
      nexhealthProviderId: string;
      firstName: string | null;
      lastName: string;
    };
  }>;
  savedOperatories: Array<{
    id: string;
    nexhealthOperatoryId: string;
    name: string;
    isDefault: boolean;
    isActive: boolean;
  }>;
  manualAvailabilities: ManualAvailabilityData[];
  nexhealthWebhookSubscriptions: Array<{
    resourceType: string;
    eventName: string;
    nexhealthSubscriptionId: string;
  }>;
}

interface GlobalWebhookEndpoint {
  id: string;
}

export default function PracticeConfigPage() {
  const { userId, isLoaded } = useAuth();
  const [practice, setPractice] = useState<Practice | null>(null);
  const [globalWebhookEndpoint, setGlobalWebhookEndpoint] = useState<GlobalWebhookEndpoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && !userId) {
      redirect("/sign-in");
    }
  }, [isLoaded, userId]);

  useEffect(() => {
    if (isLoaded && userId) {
      fetchPracticeData();
    }
  }, [isLoaded, userId]);

  const fetchPracticeData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/practice-config/data');
      if (response.ok) {
        const data = await response.json();
        setPractice(data.practice);
        setGlobalWebhookEndpoint(data.globalWebhookEndpoint);
      } else {
        console.error('Failed to fetch practice data');
      }
    } catch (error) {
      console.error('Error fetching practice data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigSave = async (formData: FormData) => {
    setConfigLoading(true);
    try {
      const response = await fetch('/api/practice-config/basic', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.webhookSync?.success) {
          toast.success('Configuration saved and webhooks synchronized successfully!');
        } else if (result.webhookSync?.message) {
          toast.success('Configuration saved successfully!');
          toast.warning(`Webhook sync: ${result.webhookSync.message}`);
        } else {
          toast.success('Configuration saved successfully!');
        }
        
        await fetchPracticeData(); // Refresh data
      } else {
        toast.error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const response = await fetch('/api/sync-nexhealth', {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('NexHealth data synced successfully!');
        await fetchPracticeData(); // Refresh data
      } else {
        toast.error('Failed to sync NexHealth data');
      }
    } catch (error) {
      console.error('Error syncing data:', error);
      toast.error('Failed to sync NexHealth data');
    } finally {
      setSyncLoading(false);
    }
  };

  const refreshPracticeData = async () => {
    await fetchPracticeData();
  };

  if (!isLoaded || loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!userId) {
    return null; // Will redirect
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Practice Configuration</h1>
        
        {/* Basic Information Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            await handleConfigSave(formData);
          }} className="space-y-4">
            <div>
              <label htmlFor="practiceName" className="block text-sm font-medium text-gray-700 mb-1">
                Practice Name (Optional)
              </label>
              <input
                type="text"
                id="practiceName"
                name="practiceName"
                defaultValue={practice?.name || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your practice name"
              />
            </div>
            
            <div>
              <label htmlFor="nexhealthSubdomain" className="block text-sm font-medium text-gray-700 mb-1">
                NexHealth Subdomain *
              </label>
              <input
                type="text"
                id="nexhealthSubdomain"
                name="nexhealthSubdomain"
                defaultValue={practice?.nexhealthSubdomain || ""}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., testdental"
              />
              <p className="text-sm text-gray-500 mt-1">
                Your NexHealth subdomain (the part before .nexhealth.com)
              </p>
            </div>
            
            <div>
              <label htmlFor="nexhealthLocationId" className="block text-sm font-medium text-gray-700 mb-1">
                NexHealth Location ID *
              </label>
              <input
                type="text"
                id="nexhealthLocationId"
                name="nexhealthLocationId"
                defaultValue={practice?.nexhealthLocationId || ""}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 123"
              />
              <p className="text-sm text-gray-500 mt-1">
                Your NexHealth Location ID number
              </p>
            </div>

            <div>
              <label htmlFor="practiceAddress" className="block text-sm font-medium text-gray-700 mb-1">
                Practice Address
              </label>
              <input
                type="text"
                id="practiceAddress"
                name="practiceAddress"
                defaultValue={practice?.address || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 123 Dental St, Smileytown, CA 98765"
              />
            </div>

            <div>
              <label htmlFor="acceptedInsurances" className="block text-sm font-medium text-gray-700 mb-1">
                Accepted Insurances (comma-separated)
              </label>
              <input
                type="text"
                id="acceptedInsurances"
                name="acceptedInsurances"
                defaultValue={practice?.acceptedInsurances || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Cigna, Delta Dental, MetLife"
              />
              <p className="text-sm text-gray-500 mt-1">Enter insurance names separated by commas.</p>
            </div>

            <div>
              <label htmlFor="serviceCostEstimates" className="block text-sm font-medium text-gray-700 mb-1">
                Service Cost Estimates (comma-separated)
              </label>
              <input
                type="text"
                id="serviceCostEstimates"
                name="serviceCostEstimates"
                defaultValue={practice?.serviceCostEstimates || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Cleaning: $120, Exam: $80, X-Ray: $50"
              />
              <p className="text-sm text-gray-500 mt-1">Format as &apos;Service Name: $Cost&apos;, separated by commas.</p>
            </div>
            
            <button
              type="submit"
              disabled={configLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {configLoading ? 'Saving...' : 'Save Basic Info & Sync Webhooks'}
            </button>
          </form>
        </div>

        {practice?.nexhealthSubdomain && practice?.nexhealthLocationId && (
          <>
            {/* NexHealth Data Sync Section */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">NexHealth Data Sync</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Appointment Types</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {practice.appointmentTypes.length} synced
                  </p>
                  {practice.appointmentTypes.length > 0 && (
                    <ul className="text-sm space-y-1">
                      {practice.appointmentTypes.slice(0, 5).map((type) => (
                        <li key={type.id} className="text-gray-700">
                          {type.name} ({type.duration} min)
                        </li>
                      ))}
                      {practice.appointmentTypes.length > 5 && (
                        <li className="text-gray-500">
                          ... and {practice.appointmentTypes.length - 5} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Providers</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {practice.providers.length} synced
                  </p>
                  {practice.providers.length > 0 && (
                    <ul className="text-sm space-y-1">
                      {practice.providers.slice(0, 5).map((provider) => (
                        <li key={provider.id} className="text-gray-700">
                          {provider.firstName} {provider.lastName}
                        </li>
                      ))}
                      {practice.providers.length > 5 && (
                        <li className="text-gray-500">
                          ... and {practice.providers.length - 5} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
              
              <div className="mt-6">
                <button
                  onClick={handleSync}
                  disabled={syncLoading}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncLoading ? 'Syncing...' : 'Sync NexHealth Data'}
                </button>
              </div>
            </div>

            {/* Appointment Types Management Section */}
            {practice.nexhealthSubdomain && practice.nexhealthLocationId && (
              <div className="mb-6">
                <AppointmentTypeManager
                  initialAppointmentTypes={practice.appointmentTypes.map(at => ({
                    id: at.id,
                    nexhealthAppointmentTypeId: at.nexhealthAppointmentTypeId,
                    name: at.name,
                    duration: at.duration,
                    bookableOnline: at.bookableOnline,
                    parentType: at.parentType,
                    parentId: at.parentId,
                    lastSyncError: at.lastSyncError,
                    createdAt: at.createdAt,
                    updatedAt: at.updatedAt
                  }))}
                  onUpdate={refreshPracticeData}
                />
              </div>
            )}

            {/* Provider Selection Section */}
            {practice.providers.length > 0 && (
              <div className="mb-6">
                <ProviderSelection
                  providers={practice.providers}
                  savedProviders={practice.savedProviders}
                  onUpdate={refreshPracticeData}
                />
              </div>
            )}

            {/* Operatory Selection Section */}
            <div className="mb-6">
              <OperatorySelection
                practice={{
                  nexhealthSubdomain: practice.nexhealthSubdomain,
                  nexhealthLocationId: practice.nexhealthLocationId
                }}
                savedOperatories={practice.savedOperatories}
                onUpdate={refreshPracticeData}
              />
            </div>

            {/* Manual Availability Configuration Section */}
            {practice.providers.length > 0 && practice.appointmentTypes.length > 0 && (
              <div className="mb-6">
                <AvailabilityManager
                  practiceId={practice.id}
                  providers={practice.providers}
                  savedOperatories={practice.savedOperatories}
                  appointmentTypes={practice.appointmentTypes}
                  initialAvailabilities={practice.manualAvailabilities || []}
                  onUpdate={refreshPracticeData}
                />
              </div>
            )}

            {/* Check Appointment Slots Section */}
            {practice.appointmentTypes.length > 0 && practice.savedProviders.length > 0 && (
              <div className="mb-6">
                <CheckAppointmentSlots
                  appointmentTypes={practice.appointmentTypes}
                  savedProviders={practice.savedProviders}
                  savedOperatories={practice.savedOperatories}
                />
              </div>
            )}

            {/* Webhook Management Section */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Webhook Integration</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    Webhooks allow Laine to receive real-time updates from NexHealth when appointments are created, 
                    updated, or when patients are modified.
                  </p>
                  
                  {/* Last Sync Status */}
                  {practice.webhookLastSyncAt && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-sm font-medium text-blue-800">
                          Last webhook sync: {new Date(practice.webhookLastSyncAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-blue-600 mt-1">
                        Webhooks are automatically synchronized when you save practice configuration
                      </p>
                    </div>
                  )}
                  
                  {!globalWebhookEndpoint ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <p className="text-sm text-yellow-800">
                        ⚠️ Global webhook endpoint not configured. Contact support to enable webhook functionality.
                      </p>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-medium text-gray-900 mb-3">Subscription Status</h3>
                      {practice.nexhealthWebhookSubscriptions && practice.nexhealthWebhookSubscriptions.length > 0 ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {practice.nexhealthWebhookSubscriptions.map((sub) => (
                              <div key={`${sub.resourceType}-${sub.eventName}`} className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded-md p-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-gray-700 font-medium">
                                  {sub.resourceType}.{sub.eventName}
                                </span>
                                <span className="text-xs text-gray-500 ml-auto">
                                  ID: {sub.nexhealthSubscriptionId}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="bg-green-50 border border-green-200 rounded-md p-3">
                            <p className="text-sm text-green-800">
                              ✅ {practice.nexhealthWebhookSubscriptions.length} webhook subscription(s) active. 
                              Laine will receive real-time updates from NexHealth.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                          <p className="text-sm text-orange-800">
                            ⚠️ No active webhook subscriptions found. Webhooks will be automatically configured when you save your practice configuration above.
                          </p>
                          <p className="text-xs text-orange-600 mt-2">
                            If webhooks are still missing after saving, check that your NexHealth subdomain and location ID are correct.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Scheduling Configuration Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-blue-900">Scheduling Configuration Summary</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-800">Appointment Types:</span>
                  <span className="font-medium text-blue-900">
                    {practice.appointmentTypes.length} available
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-800">Saved Providers:</span>
                  <span className="font-medium text-blue-900">
                    {practice.savedProviders.length} configured for scheduling
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-800">Saved Operatories:</span>
                  <span className="font-medium text-blue-900">
                    {practice.savedOperatories.length} configured for scheduling
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-800">Manual Availabilities:</span>
                  <span className="font-medium text-blue-900">
                    {practice.manualAvailabilities?.length || 0} configured
                  </span>
                </div>
                
                {practice.appointmentTypes.length > 0 && practice.savedProviders.length > 0 ? (
                  <div className="bg-green-100 border border-green-300 rounded-md p-3 mt-4">
                    <p className="text-green-800 font-medium">
                      ✅ Your practice is ready for AI voice scheduling!
                    </p>
                    <p className="text-green-700 text-xs mt-1">
                      Laine can now help patients find appointments, check availability, and schedule visits.
                    </p>
                  </div>
                ) : (
                  <div className="bg-yellow-100 border border-yellow-300 rounded-md p-3 mt-4">
                    <p className="text-yellow-800 font-medium">
                      ⚠️ Configuration incomplete
                    </p>
                    <p className="text-yellow-700 text-xs mt-1">
                      Please sync NexHealth data and select providers to enable scheduling.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
} 