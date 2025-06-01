"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Operatory {
  id: number;
  name: string;
  location_id: number;
  active: boolean;
}

interface SavedOperatory {
  id: string;
  nexhealthOperatoryId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

interface OperatorySelectionProps {
  practice: {
    nexhealthSubdomain: string;
    nexhealthLocationId: string;
  };
  savedOperatories: SavedOperatory[];
  onUpdate: () => void;
}

export function OperatorySelection({ practice, savedOperatories, onUpdate }: OperatorySelectionProps) {
  const [operatories, setOperatories] = useState<Operatory[]>([]);
  const [selectedOperatories, setSelectedOperatories] = useState<Operatory[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingOperatories, setFetchingOperatories] = useState(false);

  useEffect(() => {
    if (practice.nexhealthSubdomain && practice.nexhealthLocationId) {
      fetchOperatories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practice.nexhealthSubdomain, practice.nexhealthLocationId]);

  const fetchOperatories = async () => {
    setFetchingOperatories(true);
    try {
      // Call NexHealth API to get operatories
      const response = await fetch('/api/practice-config/fetch-operatories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain: practice.nexhealthSubdomain,
          locationId: practice.nexhealthLocationId
        })
      });

      if (!response.ok) throw new Error('Failed to fetch operatories');

      const data = await response.json();
      setOperatories(data.operatories || []);
      
      // Pre-select saved operatories
      const savedOperatoryIds = savedOperatories.map(so => so.nexhealthOperatoryId);
      setSelectedOperatories(
        data.operatories.filter((op: Operatory) => 
          savedOperatoryIds.includes(op.id.toString())
        )
      );
    } catch (error) {
      toast.error('Failed to fetch operatories');
      console.error(error);
    } finally {
      setFetchingOperatories(false);
    }
  };

  const handleOperatoryToggle = (operatory: Operatory) => {
    setSelectedOperatories(prev => {
      const isSelected = prev.some(op => op.id === operatory.id);
      if (isSelected) {
        return prev.filter(op => op.id !== operatory.id);
      } else {
        return [...prev, operatory];
      }
    });
  };

  const handleSaveOperatories = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/practice-config/operatories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          operatories: selectedOperatories.map(op => ({
            id: op.id.toString(),
            name: op.name
          })),
          setAsDefault: true 
        })
      });

      if (!response.ok) throw new Error('Failed to save operatories');

      toast.success('Operatories saved successfully!');
      onUpdate();
    } catch (error) {
      toast.error('Failed to save operatories');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingOperatories) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Operatory Selection</h3>
        <div className="text-gray-600">Loading operatories...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Select Operatories for Scheduling</h3>
      <p className="text-sm text-gray-600 mb-4">
        Choose which operatories (rooms/chairs) should be available for appointment scheduling.
      </p>
      
      {operatories.length === 0 ? (
        <div className="text-gray-600 mb-4">
          No operatories found. This practice might not use operatory-based scheduling.
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {operatories.map(operatory => {
            const isSelected = selectedOperatories.some(op => op.id === operatory.id);
            const isSaved = savedOperatories.some(so => so.nexhealthOperatoryId === operatory.id.toString());
            
            return (
              <div key={operatory.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`operatory-${operatory.id}`}
                  checked={isSelected}
                  onChange={() => handleOperatoryToggle(operatory)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor={`operatory-${operatory.id}`} className="flex-1 text-sm">
                  {operatory.name}
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
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSaveOperatories}
          disabled={loading || selectedOperatories.length === 0}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : `Save ${selectedOperatories.length} Operatory(s)`}
        </button>
        
        {savedOperatories.length > 0 && (
          <div className="text-sm text-gray-600 flex items-center">
            ✅ {savedOperatories.length} operatory(s) currently saved for scheduling
          </div>
        )}
      </div>
    </div>
  );
} 