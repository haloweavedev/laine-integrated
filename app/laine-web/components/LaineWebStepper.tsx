"use client";

import { useScheduling } from './SchedulingContext';
import { Step1_Identity } from './steps/Step1_Identity';
import { Step2_AppointmentType } from './steps/Step2_AppointmentType';
import { Step3_Scheduler } from './steps/Step3_Scheduler';
import { Step4_Finalize } from './steps/Step4_Finalize';
import { Step5_Confirmation } from './steps/Step5_Confirmation';

export function LaineWebStepper() {
  const { state } = useScheduling();

  const renderStep = () => {
    switch (state.step) {
      case 1:
        return <Step1_Identity />;
      case 2:
        return <Step2_AppointmentType />;
      case 3:
        return <Step3_Scheduler />;
      case 4:
        return <Step4_Finalize />;
      case 5:
        return <Step5_Confirmation />;
      default:
        return <Step1_Identity />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((stepNumber) => (
            <div
              key={stepNumber}
              className={`flex items-center ${stepNumber < 4 ? 'flex-1' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  state.step >= stepNumber
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {stepNumber}
              </div>
              {stepNumber < 4 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    state.step > stepNumber ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Identity</span>
          <span>Service</span>
          <span>Schedule</span>
          <span>Confirm</span>
        </div>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800 text-sm">{state.error}</p>
        </div>
      )}

      {/* Loading overlay */}
      {state.isLoading && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <p className="text-blue-800 text-sm">Processing...</p>
          </div>
        </div>
      )}

      {/* Current step content */}
      <div className="min-h-[400px]">
        {renderStep()}
      </div>
    </div>
  );
} 