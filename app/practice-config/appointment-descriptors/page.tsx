"use client";

import { useState, useEffect } from "react";
import { getAppointmentDescriptorsAction } from "./actions";

interface NexHealthAppointmentDescriptor {
  id: number;
  name: string;
  code: string;
  descriptor_type: string;
  active?: boolean;
  location_id?: number;
  foreign_id?: string;
  foreign_id_type?: string;
  last_sync_time?: string | null;
  created_at?: string;
  updated_at?: string;
  data?: {
    AbbrDesc?: string;
    ProcTime?: string;
    PaintType?: number;
    TreatArea?: number;
  };
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
  const [selectedDescriptorType, setSelectedDescriptorType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 30;

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

  // Get unique descriptor types from the data
  const getAvailableDescriptorTypes = (data: AppointmentDescriptorsData): string[] => {
    const types = new Set(data.descriptors.map(d => d.descriptor_type));
    return Array.from(types).sort();
  };

  // Process descriptors to add duration information
  const processDescriptors = (data: AppointmentDescriptorsData, filterType: string): ProcessedDescriptor[] => {
    // Filter descriptors based on selected type
    let filteredDescriptors = data.descriptors;
    if (filterType !== "all") {
      filteredDescriptors = data.descriptors.filter(
        descriptor => descriptor.descriptor_type === filterType
      );
    }

    return filteredDescriptors.map(descriptor => {
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

  // Handle filter change and reset page
  const handleFilterChange = (newFilter: string) => {
    setSelectedDescriptorType(newFilter);
    setCurrentPage(1); // Reset to first page when filter changes
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

  const availableTypes = getAvailableDescriptorTypes(data);
  const allProcessedDescriptors = processDescriptors(data, selectedDescriptorType);
  
  // Pagination calculations
  const totalItems = allProcessedDescriptors.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const processedDescriptors = allProcessedDescriptors.slice(startIndex, endIndex);

  // Calculate metrics for the review section
  const totalDescriptors = data.descriptors.length;
  const activeDescriptors = data.descriptors.filter(d => d.active !== false).length;
  const configuredInLaine = data.descriptors.filter(d => 
    data.localAppointmentTypes.some(local => 
      local.nexhealthAppointmentTypeId === d.id.toString()
    )
  ).length;
  const typeCounts = availableTypes.map(type => ({
    type,
    count: data.descriptors.filter(d => d.descriptor_type === type).length
  }));

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

      {/* Review Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Review</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Descriptors */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900">{totalDescriptors}</p>
                <p className="text-sm text-gray-600">Total Descriptors</p>
              </div>
            </div>
          </div>

          {/* Active Descriptors */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900">{activeDescriptors}</p>
                <p className="text-sm text-gray-600">Active Descriptors</p>
                <p className="text-xs text-gray-500">
                  {totalDescriptors > 0 ? Math.round((activeDescriptors / totalDescriptors) * 100) : 0}% of total
                </p>
              </div>
            </div>
          </div>

          {/* Configured in Laine */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900">{configuredInLaine}</p>
                <p className="text-sm text-gray-600">Configured in Laine</p>
                <p className="text-xs text-gray-500">
                  {totalDescriptors > 0 ? Math.round((configuredInLaine / totalDescriptors) * 100) : 0}% have duration settings
                </p>
              </div>
            </div>
          </div>

          {/* Descriptor Types */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900">{availableTypes.length}</p>
                <p className="text-sm text-gray-600">Descriptor Types</p>
                <div className="text-xs text-gray-500 space-y-1 mt-1">
                  {typeCounts.slice(0, 2).map(({ type, count }) => (
                    <div key={type} className="flex justify-between">
                      <span className="truncate">{type}:</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                  {typeCounts.length > 2 && (
                    <div className="text-gray-400">
                      +{typeCounts.length - 2} more...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Type Breakdown */}
        {availableTypes.length > 0 && (
          <div className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Descriptor Type Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {typeCounts.map(({ type, count }) => {
                const percentage = totalDescriptors > 0 ? Math.round((count / totalDescriptors) * 100) : 0;
                return (
                  <div key={type} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{type}</p>
                      <p className="text-xs text-gray-500">{percentage}% of total</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{count}</p>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Descriptor Type Filter */}
      <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Filter by Descriptor Type</h3>
            <p className="text-sm text-gray-600">
              Available types: {availableTypes.join(", ")}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <label htmlFor="descriptor-type" className="text-sm font-medium text-gray-700">
              Show:
            </label>
            <select
              id="descriptor-type"
              value={selectedDescriptorType}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Types ({data.descriptors.length})</option>
              {availableTypes.map(type => {
                const count = data.descriptors.filter(d => d.descriptor_type === type).length;
                return (
                  <option key={type} value={type}>
                    {type} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
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
                No Descriptors Found
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>No descriptors match the selected filter criteria.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedDescriptorType === "all" ? "All Descriptors" : selectedDescriptorType}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedDescriptorType === "all" 
                    ? "Showing all appointment descriptors and their configured durations from Laine."
                    : `Showing descriptors with type "${selectedDescriptorType}" and their configured durations from Laine.`
                  }
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {totalItems > 0 ? startIndex + 1 : 0}-{Math.min(endIndex, totalItems)} of {totalItems}
                </p>
                <p className="text-xs text-gray-500">
                  Page {currentPage} of {totalPages || 1}
                </p>
              </div>
            </div>
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
                    Type
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration (Laine Config)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedDescriptors.map((descriptor) => (
                  <tr key={descriptor.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {descriptor.name}
                      </div>
                      {descriptor.data?.AbbrDesc && (
                        <div className="text-xs text-gray-500">
                          Abbr: {descriptor.data.AbbrDesc}
                        </div>
                      )}
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
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {descriptor.descriptor_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {descriptor.active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${
                        descriptor.localMatch 
                          ? 'text-green-600' 
                          : 'text-gray-400'
                      }`}>
                        {descriptor.duration}
                      </div>
                      {descriptor.localMatch && (
                        <div className="text-xs text-gray-500">
                          Configured in Laine
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing <span className="font-medium">{totalItems > 0 ? startIndex + 1 : 0}</span> to{' '}
                  <span className="font-medium">{Math.min(endIndex, totalItems)}</span> of{' '}
                  <span className="font-medium">{totalItems}</span> results
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-2 text-sm font-medium rounded-md ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              <strong>Note:</strong> Duration information comes from your local Laine configuration. 
              Items marked as &quot;Not configured in Laine&quot; are configured in NexHealth but not yet imported into your Laine practice settings.
              {!availableTypes.includes("Appointment Type") && (
                <>
                  <br />
                  <strong>Observation:</strong> No descriptors with type &quot;Appointment Type&quot; were found. 
                  Your NexHealth location appears to have {availableTypes.join(", ")} instead.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Debug section */}
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