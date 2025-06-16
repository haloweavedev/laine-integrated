"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Toaster, toast } from "sonner";
import { QuickReview } from "./QuickReview";
import { AppointmentTypesConfig } from "./AppointmentTypesConfig";
import { ProvidersConfig } from "./ProvidersConfig";
import { CheckAppointmentSlotsTool } from "./CheckAppointmentSlotsTool";

// Types for the simplified structure
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
    groupCode: string | null;
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
    isActive: boolean;
  }>;
}

interface WebhookStatus {
  lastSyncStatus: 'NEVER_SYNCED' | 'SYNCED' | 'SYNC_IN_PROGRESS' | 'ERROR';
  lastSyncAttemptAt: string | null;
  lastSyncErrorMessage: string | null;
  subscriptionCounts: {
    appointment: number;
    availability: number;
    patient: number;
    provider: number;
    location: number;
  };
}

export default function PracticeConfigPage() {
  const { userId, isLoaded } = useAuth();
  const [practice, setPractice] = useState<Practice | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [basicInfoLoading, setBasicInfoLoading] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && !userId) {
      redirect("/sign-in");
    }
  }, [isLoaded, userId]);

  useEffect(() => {
    if (isLoaded && userId) {
      fetchPracticeData();
      fetchWebhookStatus();
    }
  }, [isLoaded, userId]);

  const fetchPracticeData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/practice-config/data');
      if (response.ok) {
        const data = await response.json();
        setPractice(data.practice);
      } else {
        console.error('Failed to fetch practice data');
      }
    } catch (error) {
      console.error('Error fetching practice data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookStatus = async () => {
    try {
      setWebhookLoading(true);
      const response = await fetch('/api/practice-config/webhook-status');
      if (response.ok) {
        const data = await response.json();
        setWebhookStatus(data);
      } else {
        console.error('Failed to fetch webhook status');
      }
    } catch (error) {
      console.error('Error fetching webhook status:', error);
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleBasicInfoSave = async (formData: FormData) => {
    setBasicInfoLoading(true);
    try {
      const response = await fetch('/api/practice-config/basic', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast.success('Basic information saved successfully!');
        
        // Refresh data after save
        await fetchPracticeData();
        await fetchWebhookStatus();
      } else {
        const error = await response.json();
        toast.error(`Failed to save: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setBasicInfoLoading(false);
    }
  };

  const refreshWebhookStatus = async () => {
    await fetchWebhookStatus();
  };

  const refreshPracticeData = async () => {
    await fetchPracticeData();
  };

  const getWebhookStatusIcon = (status: WebhookStatus['lastSyncStatus']) => {
    switch (status) {
      case 'SYNCED':
        return <div className="w-3 h-3 bg-green-500 rounded-full"></div>;
      case 'SYNC_IN_PROGRESS':
        return <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>;
      case 'ERROR':
        return <div className="w-3 h-3 bg-red-500 rounded-full"></div>;
      case 'NEVER_SYNCED':
        return <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>;
      default:
        return <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse"></div>;
    }
  };

  const getWebhookStatusText = (status: WebhookStatus['lastSyncStatus']) => {
    switch (status) {
      case 'SYNCED':
        return 'Webhooks Synced';
      case 'SYNC_IN_PROGRESS':
        return 'Sync In Progress';
      case 'ERROR':
        return 'Webhook Error';
      case 'NEVER_SYNCED':
        return 'Never Synced';
      default:
        return 'Unknown Status';
    }
  };

  if (!isLoaded || loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
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
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Practice Configuration</h1>
        
        {/* Basic Information Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            await handleBasicInfoSave(formData);
          }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div>
              <label htmlFor="serviceCostEstimates" className="block text-sm font-medium text-gray-700 mb-1">
                Service Cost Estimates (comma-separated &apos;Service: $Cost&apos;)
              </label>
              <input
                type="text"
                id="serviceCostEstimates"
                name="serviceCostEstimates"
                defaultValue={practice?.serviceCostEstimates || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Cleaning: $120, Exam: $80, X-Ray: $50"
              />
            </div>
            
            <div className="flex justify-between items-center">
              <button
                type="submit"
                disabled={basicInfoLoading}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {basicInfoLoading ? 'Saving...' : 'Save Basic Information'}
              </button>
            </div>
          </form>
        </div>

        {/* Webhook Status Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Webhook Status</h2>
            <button
              onClick={refreshWebhookStatus}
              disabled={webhookLoading}
              className="text-blue-600 hover:text-blue-700 disabled:opacity-50 text-sm"
            >
              {webhookLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          
          {webhookStatus ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {getWebhookStatusIcon(webhookStatus.lastSyncStatus)}
                <span className="font-medium">{getWebhookStatusText(webhookStatus.lastSyncStatus)}</span>
                {webhookStatus.lastSyncAttemptAt && (
                  <span className="text-sm text-gray-500">
                    Last sync: {new Date(webhookStatus.lastSyncAttemptAt).toLocaleString()}
                  </span>
                )}
              </div>
              
              {webhookStatus.lastSyncErrorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-red-800 text-sm">{webhookStatus.lastSyncErrorMessage}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div className="text-center">
                  <div className="font-semibold text-lg">{webhookStatus.subscriptionCounts.appointment}</div>
                  <div className="text-gray-600">Appointments</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-lg">{webhookStatus.subscriptionCounts.availability}</div>
                  <div className="text-gray-600">Availability</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-lg">{webhookStatus.subscriptionCounts.patient}</div>
                  <div className="text-gray-600">Patients</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-lg">{webhookStatus.subscriptionCounts.provider}</div>
                  <div className="text-gray-600">Providers</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-lg">{webhookStatus.subscriptionCounts.location}</div>
                  <div className="text-gray-600">Locations</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Loading webhook status...</div>
          )}
        </div>

        {practice?.nexhealthSubdomain && practice?.nexhealthLocationId && (
          <>
            {/* Quick Review Section */}
            <div className="mb-6">
              <QuickReview />
            </div>

            {/* Appointment Types Configuration Section */}
            <div className="mb-6">
              <AppointmentTypesConfig
                initialAppointmentTypes={practice.appointmentTypes}
                onUpdate={refreshPracticeData}
              />
            </div>

            {/* Providers Configuration Section */}
            <div className="mb-6">
              <ProvidersConfig
                savedProviders={practice.savedProviders}
                allProviders={practice.providers}
                allAppointmentTypes={practice.appointmentTypes}
                allOperatories={practice.savedOperatories}
                onUpdate={refreshPracticeData}
              />
            </div>

            {/* Check Appointment Slots Section */}
            <div className="mb-6">
              <CheckAppointmentSlotsTool
                appointmentTypes={practice.appointmentTypes}
                savedProviders={practice.savedProviders}
                savedOperatories={practice.savedOperatories}
              />
            </div>
          </>
        )}

        {(!practice?.nexhealthSubdomain || !practice?.nexhealthLocationId) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">Setup Required</h3>
            <p className="text-yellow-700">
              Please complete the basic information above (NexHealth Subdomain and Location ID) to access the full configuration options.
            </p>
          </div>
        )}
      </div>
    </>
  );
} 