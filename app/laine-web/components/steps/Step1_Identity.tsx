"use client";

import { useState } from 'react';
import { useScheduling } from '../SchedulingContext';

export function Step1_Identity() {
  const { state, setPatientDetails, nextStep } = useScheduling();
  
  // Local form state
  const [formData, setFormData] = useState({
    firstName: state.patient.firstName,
    lastName: state.patient.lastName,
    status: state.patient.status
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      return;
    }

    // Update context and move to next step
    setPatientDetails({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      status: formData.status
    });
    
    nextStep();
  };

  const isFormValid = formData.firstName.trim() && formData.lastName.trim();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Let&apos;s start with your information
        </h2>
        <p className="text-gray-600">
          Please provide your name and let us know if you&apos;re a new or returning patient.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
              First Name *
            </label>
            <input
              id="firstName"
              type="text"
              value={formData.firstName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                setFormData(prev => ({ ...prev, firstName: e.target.value }))
              }
              placeholder="Enter your first name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
              Last Name *
            </label>
            <input
              id="lastName"
              type="text"
              value={formData.lastName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                setFormData(prev => ({ ...prev, lastName: e.target.value }))
              }
              placeholder="Enter your last name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        {/* Patient Status */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Are you a new or returning patient? *
          </label>
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                id="new-patient"
                type="radio"
                name="patientStatus"
                value="NEW"
                checked={formData.status === 'NEW'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                  setFormData(prev => ({ ...prev, status: e.target.value as 'NEW' | 'RETURNING' }))
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <label htmlFor="new-patient" className="ml-2 block text-sm text-gray-700 cursor-pointer">
                New Patient - This is my first visit to this practice
              </label>
            </div>
            <div className="flex items-center">
              <input
                id="returning-patient"
                type="radio"
                name="patientStatus"
                value="RETURNING"
                checked={formData.status === 'RETURNING'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                  setFormData(prev => ({ ...prev, status: e.target.value as 'NEW' | 'RETURNING' }))
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <label htmlFor="returning-patient" className="ml-2 block text-sm text-gray-700 cursor-pointer">
                Returning Patient - I have been here before
              </label>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={!isFormValid}
            className="px-8 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
} 