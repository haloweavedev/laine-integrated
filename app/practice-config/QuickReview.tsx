"use client";

import { useState, useEffect } from "react";

interface QuickReviewData {
  appointmentsBookedByLaine: number;
  activeProvidersCount: number;
  appointmentTypesCount: number;
}

export function QuickReview() {
  const [data, setData] = useState<QuickReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuickReviewData();
  }, []);

  const fetchQuickReviewData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/practice-config/quick-review');
      
      if (response.ok) {
        const result = await response.json();
        setData(result);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to fetch quick review data');
      }
    } catch (err) {
      setError('Failed to fetch quick review data');
      console.error('Error fetching quick review data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Review</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="text-center">
              <div className="h-8 bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Review</h2>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">{error}</p>
          <button
            onClick={fetchQuickReviewData}
            className="mt-2 text-red-600 hover:text-red-700 text-sm underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-6">Quick Review</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="text-3xl font-bold text-blue-600 mb-2">
            {data?.appointmentsBookedByLaine || 0}
          </div>
          <div className="text-sm text-blue-800 font-medium">
            Appointments Booked via Laine
          </div>
          <div className="text-xs text-blue-600 mt-1">
            Total appointments scheduled through Laine AI
          </div>
        </div>

        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-3xl font-bold text-green-600 mb-2">
            {data?.activeProvidersCount || 0}
          </div>
          <div className="text-sm text-green-800 font-medium">
            Active Providers
          </div>
          <div className="text-xs text-green-600 mt-1">
            Providers available for scheduling
          </div>
        </div>

        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <div className="text-3xl font-bold text-purple-600 mb-2">
            {data?.appointmentTypesCount || 0}
          </div>
          <div className="text-sm text-purple-800 font-medium">
            Appointment Types Created
          </div>
          <div className="text-xs text-purple-600 mt-1">
            Total appointment types configured
          </div>
        </div>
      </div>
      
      <div className="mt-4 flex justify-end">
        <button
          onClick={fetchQuickReviewData}
          disabled={loading}
          className="text-blue-600 hover:text-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
} 