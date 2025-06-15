"use client";

import { useState, useEffect } from "react";
import { getAppointmentDescriptorsAction } from "./actions";

interface NexHealthAppointmentDescriptor {
  id: number;
  name: string;
  code: string;
  descriptor_type: string;
}

interface LocalAppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  bookableOnline: boolean | null;
}

interface AppointmentDescriptorsData {
  descriptors: NexHealthAppointmentDescriptor[];
  localAppointmentTypes: LocalAppointmentType[];
  practiceId: string;
}

interface ProcessedDescriptor extends NexHealthAppointmentDescriptor {
  duration: string;
  localMatch: LocalAppointmentType | null;
}

export default function AppointmentDescriptorsPage() {
  const [data, setData] = useState<AppointmentDescriptorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const result = await getAppointmentDescriptorsAction();
        
        if (result.success && result.data) {
          setData(result.data);
        } else {
          setError(result.error || 'Failed to fetch appointment descriptors');
        }
      } catch (err) {
        console.error('Error fetching appointment descriptors:', err);
        setError('An unexpected error occurred while fetching data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Process descriptors to add duration information
  const processDescriptors = (data: AppointmentDescriptorsData): ProcessedDescriptor[] => {
    // Filter to only "Appointment Type" descriptors
    const appointmentTypeDescriptors = data.descriptors.filter(
      descriptor => descriptor.descriptor_type === "Appointment Type"
    );

    return appointmentTypeDescriptors.map(descriptor => {
      // Try to find matching local appointment type
      const localMatch = data.localAppointmentTypes.find(
        local => local.nexhealthAppointmentTypeId === descriptor.id.toString()
      ) || null;

      const duration = localMatch 
        ? `${localMatch.duration} minutes`
        : "Not configured in Laine";

      return {
        ...descriptor,
        duration,
        localMatch
      };
    });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            NexHealth Appointment Descriptors
          </h1>
          <p className="text-gray-600">
            Loading appointment descriptors from your NexHealth location...
          </p>
        </div>
        
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            NexHealth Appointment Descriptors
          </h1>
          <p className="text-gray-600">
            View appointment descriptors configured for your NexHealth location.
          </p>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error Loading Data
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const processedDescriptors = processDescriptors(data);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          NexHealth Appointment Descriptors
        </h1>
        <p className="text-gray-600">
          View appointment descriptors configured for your NexHealth location. Only descriptors with type &quot;Appointment Type&quot; are shown.
        </p>
      </div>

      {processedDescriptors.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                No Appointment Type Descriptors Found
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>No appointment descriptors with type &quot;Appointment Type&quot; were found for your NexHealth location. This might indicate that no appointment types are configured, or they have a different descriptor type.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">
              Appointment Type Descriptors ({processedDescriptors.length})
            </h2>
                         <p className="text-sm text-gray-600 mt-1">
               Showing descriptors with type &quot;Appointment Type&quot; and their configured durations from Laine.
             </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    NexHealth ID
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Slot Length (Duration)
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status in Laine
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedDescriptors.map((descriptor) => (
                  <tr key={descriptor.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {descriptor.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {descriptor.id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {descriptor.code || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${
                        descriptor.localMatch 
                          ? 'text-green-600' 
                          : 'text-gray-400'
                      }`}>
                        {descriptor.duration}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {descriptor.localMatch ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Not in Laine
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {data.localAppointmentTypes.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-600">
                <strong>Note:</strong> Duration information comes from your local Laine configuration. 
                                 Descriptors marked as &quot;Not in Laine&quot; are configured in NexHealth but not yet imported into your Laine practice settings.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Debug section - can be removed in production */}
      <div className="mt-8">
        <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
            Debug Information (Click to expand)
          </summary>
          <div className="bg-white rounded border p-3 overflow-auto">
            <h4 className="font-medium text-gray-900 mb-2">Raw API Response:</h4>
            <pre className="text-xs text-gray-600">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
} 