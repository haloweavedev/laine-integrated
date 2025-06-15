"use client";

import { useState, useEffect } from "react";
import { getProvidersAction, getProviderDetailAction } from "./actions";

interface NexHealthProvider {
  id: number;
  email: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  name: string;
  created_at: string;
  updated_at: string;
  institution_id: number;
  foreign_id: string;
  foreign_id_type: string;
  bio: {
    phone_number: string;
    cell_phone_number: string;
    home_phone_number: string;
  };
  inactive: boolean;
  last_sync_time: string | null;
  display_name: string | null;
  npi: string | null;
  tin: string | null;
  state_license: string | null;
  specialty_code: string;
  nexhealth_specialty: string;
  profile_url: string;
  locations: Array<{
    id: number;
    name: string;
    institution_id: number;
    street_address: string;
    street_address_2: string;
    city: string;
    state: string | null;
    zip_code: string;
    phone_number: string;
    inactive: boolean;
  }>;
  provider_requestables: unknown[];
}

interface NexHealthProviderDetail extends NexHealthProvider {
  availabilities: Array<{
    id: number;
    provider_id: number;
    location_id: number;
    operatory_id: number;
    begin_time: string;
    end_time: string;
    days: string[];
    specific_date: string | null;
    custom_recurrence: unknown | null;
    tz_offset: string;
    active: boolean;
    synced: boolean;
    appointment_types: Array<{
      id: number;
      name: string;
      parent_type: string;
      parent_id: number;
      minutes: number;
      bookable_online: boolean;
    }>;
  }>;
}

export default function ProvidersInfoPage() {
  const [providers, setProviders] = useState<NexHealthProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<NexHealthProviderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const result = await getProvidersAction();
        
        if (result.success && result.data) {
          setProviders(result.data.providers);
        } else {
          setError(result.error || 'Failed to fetch providers');
        }
      } catch (err) {
        console.error('Error fetching providers:', err);
        setError('An unexpected error occurred while fetching providers');
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, []);

  const handleProviderClick = async (providerId: number) => {
    try {
      setDetailLoading(true);
      setError(null);
      
      const result = await getProviderDetailAction(providerId);
      
      if (result.success && result.data) {
        setSelectedProvider(result.data.provider);
      } else {
        setError(result.error || 'Failed to fetch provider details');
      }
    } catch (err) {
      console.error('Error fetching provider details:', err);
      setError('An unexpected error occurred while fetching provider details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleBackToList = () => {
    setSelectedProvider(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            NexHealth Providers Information
          </h1>
          <p className="text-gray-600">
            Loading providers from your NexHealth location...
          </p>
        </div>
        
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  if (error && !selectedProvider) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            NexHealth Providers Information
          </h1>
          <p className="text-gray-600">
            View provider information and availabilities from your NexHealth location.
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

  // Provider Detail View
  if (selectedProvider) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Provider Details: {selectedProvider.name}
              </h1>
              <p className="text-gray-600">
                Detailed information, availabilities, and appointment types for this provider.
              </p>
            </div>
            <button
              onClick={handleBackToList}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ← Back to Providers
            </button>
          </div>
        </div>

        {detailLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading provider details...</span>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {!detailLoading && !error && (
          <div className="space-y-8">
            {/* Provider Information */}
            <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Provider Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Name</label>
                      <p className="text-sm text-gray-900">{selectedProvider.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">NexHealth ID</label>
                      <p className="text-sm text-gray-900">{selectedProvider.id}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Foreign ID</label>
                      <p className="text-sm text-gray-900">{selectedProvider.foreign_id}</p>
                    </div>
                    {selectedProvider.npi && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">NPI</label>
                        <p className="text-sm text-gray-900">{selectedProvider.npi}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="space-y-3">
                    {selectedProvider.email && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Email</label>
                        <p className="text-sm text-gray-900">{selectedProvider.email}</p>
                      </div>
                    )}
                    {selectedProvider.tin && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">TIN</label>
                        <p className="text-sm text-gray-900">{selectedProvider.tin}</p>
                      </div>
                    )}
                    {selectedProvider.state_license && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">State License</label>
                        <p className="text-sm text-gray-900">{selectedProvider.state_license}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-gray-500">Specialty</label>
                      <p className="text-sm text-gray-900">{selectedProvider.nexhealth_specialty}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Availabilities */}
            <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Availabilities ({selectedProvider.availabilities?.length || 0})
              </h2>
              
              {selectedProvider.availabilities && selectedProvider.availabilities.length > 0 ? (
                <div className="space-y-4">
                  {selectedProvider.availabilities.map((availability) => (
                    <div key={availability.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            availability.active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {availability.active ? 'Active' : 'Inactive'}
                          </span>
                          <span className="text-sm text-gray-500">
                            ID: {availability.id}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500">
                          {availability.begin_time} - {availability.end_time}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500 mb-1">Days</p>
                          <div className="flex flex-wrap gap-1">
                            {availability.days.map((day) => (
                              <span key={day} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {day}
                              </span>
                            ))}
                          </div>
                          {availability.specific_date && (
                            <p className="text-xs text-gray-500 mt-1">
                              Specific Date: {availability.specific_date}
                            </p>
                          )}
                        </div>
                        
                        <div>
                          <p className="text-sm font-medium text-gray-500 mb-1">
                            Appointment Types ({availability.appointment_types.length})
                          </p>
                          {availability.appointment_types.length > 0 ? (
                            <div className="space-y-1">
                              {availability.appointment_types.map((apptType) => (
                                <div key={apptType.id} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-900">{apptType.name}</span>
                                  <span className="text-gray-500">{apptType.minutes} min</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">No appointment types assigned</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No availabilities found for this provider.</p>
                </div>
              )}
            </div>

            {/* All Appointment Types Summary */}
            {selectedProvider.availabilities && (
              <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Appointment Types Summary
                </h2>
                
                {(() => {
                  const allAppointmentTypes = selectedProvider.availabilities
                    .flatMap(avail => avail.appointment_types)
                    .reduce((acc, curr) => {
                      const existing = acc.find(item => item.id === curr.id);
                      if (existing) {
                        existing.count += 1;
                      } else {
                        acc.push({ ...curr, count: 1 });
                      }
                      return acc;
                    }, [] as Array<{id: number; name: string; minutes: number; bookable_online: boolean; count: number}>);

                  return allAppointmentTypes.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Appointment Type
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Duration
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Online Bookable
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Availability Count
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {allAppointmentTypes.map((apptType) => (
                            <tr key={apptType.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {apptType.name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {apptType.minutes} minutes
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  apptType.bookable_online 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {apptType.bookable_online ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {apptType.count} availability blocks
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No appointment types found for this provider.</p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Providers List View
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          NexHealth Providers Information
        </h1>
        <p className="text-gray-600">
          View provider information and availabilities from your NexHealth location. Click on a provider to see their details.
        </p>
      </div>

      {/* Providers Summary */}
      <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{providers.length}</p>
            <p className="text-sm text-gray-600">Total Providers</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {providers.filter(p => !p.inactive).length}
            </p>
            <p className="text-sm text-gray-600">Active Providers</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">
              {providers.filter(p => p.npi).length}
            </p>
            <p className="text-sm text-gray-600">Providers with NPI</p>
          </div>
        </div>
      </div>

      {/* Providers List */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">
            Providers ({providers.length})
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Click on any provider to view their detailed information, availabilities, and appointment types.
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
                  Foreign ID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  NPI
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Specialty
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {providers.map((provider) => (
                <tr 
                  key={provider.id} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleProviderClick(provider.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-blue-600 hover:text-blue-800">
                      {provider.name}
                    </div>
                    {provider.email && (
                      <div className="text-xs text-gray-500">{provider.email}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {provider.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {provider.foreign_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {provider.npi || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {provider.nexhealth_specialty}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      !provider.inactive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {!provider.inactive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 