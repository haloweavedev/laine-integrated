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
  isDefault: boolean;
  isActive: boolean;
  provider: Provider;
}

interface ProviderSelectionProps {
  providers: Provider[];
  savedProviders: SavedProvider[];
  onUpdate: () => void;
}

export function ProviderSelection({ providers, savedProviders, onUpdate }: ProviderSelectionProps) {
  const [selectedProviders, setSelectedProviders] = useState<string[]>(
    savedProviders.map(sp => sp.providerId)
  );
  const [loading, setLoading] = useState(false);

  const handleProviderToggle = (providerId: string) => {
    setSelectedProviders(prev => 
      prev.includes(providerId)
        ? prev.filter(id => id !== providerId)
        : [...prev, providerId]
    );
  };

  const handleSaveProviders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/practice-config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          providerIds: selectedProviders,
          setAsDefault: true 
        })
      });

      if (!response.ok) throw new Error('Failed to save providers');

      toast.success('Providers saved successfully!');
      onUpdate();
    } catch (error) {
      toast.error('Failed to save providers');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Select Providers for Scheduling</h3>
      <p className="text-sm text-gray-600 mb-4">
        Choose which providers should be available for online appointment scheduling.
      </p>
      
      <div className="space-y-3 mb-6">
        {providers.map(provider => {
          const isSelected = selectedProviders.includes(provider.id);
          const isSaved = savedProviders.some(sp => sp.providerId === provider.id);
          
          return (
            <div key={provider.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`provider-${provider.id}`}
                checked={isSelected}
                onChange={() => handleProviderToggle(provider.id)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor={`provider-${provider.id}`} className="flex-1 text-sm">
                {provider.firstName} {provider.lastName} (ID: {provider.nexhealthProviderId})
                {isSaved && (
                  <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                    Currently Saved
                  </span>
                )}
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSaveProviders}
          disabled={loading || selectedProviders.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : `Save ${selectedProviders.length} Provider(s)`}
        </button>
        
        {savedProviders.length > 0 && (
          <div className="text-sm text-gray-600 flex items-center">
            ✅ {savedProviders.length} provider(s) currently saved for scheduling
          </div>
        )}
      </div>
    </div>
  );
} 