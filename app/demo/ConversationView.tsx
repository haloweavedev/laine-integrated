"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight, MessageSquare, Sparkles } from 'lucide-react';
import type { DemoMessage } from './useLaineDemo';

// CSS-in-JS styles for animations
const messageAnimation = {
  animation: 'messageSlideIn 0.3s ease-out'
};

const fadeInUpKeyframes = `
@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

function WelcomeMessage() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <div className="absolute -top-1 -right-1">
              <Sparkles className="w-5 h-5 text-yellow-400" />
            </div>
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-800 mb-3">
          Welcome to Laine Demo
        </h2>
        
        <p className="text-gray-600 mb-6 leading-relaxed">
          Hi! I&apos;m Laine, your AI dental assistant. I can help you schedule appointments, 
          check availability, verify insurance, and answer questions about dental services.
        </p>
        
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <div className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center mr-2">
              <span className="text-xs">💬</span>
            </div>
            Try saying:
          </h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p>&quot;I&apos;d like to schedule a dental cleaning&quot;</p>
            <p>&quot;What appointments do you have available this week?&quot;</p>
            <p>&quot;I need to check if my insurance is accepted&quot;</p>
          </div>
        </div>
        
        <div className="flex items-center justify-center text-xs text-gray-500">
          <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse mr-2"></div>
          <span>Click &quot;Start Call&quot; below to begin your conversation</span>
        </div>
      </div>
    </div>
  );
}

interface ToolCallIndicatorProps {
  toolName: string;
  toolArgs: Record<string, unknown>;
}

function ToolCallIndicator({ toolName, toolArgs }: ToolCallIndicatorProps) {
  // Generate a user-friendly message based on the tool name
  const getFriendlyMessage = (toolName: string) => {
    switch (toolName.toLowerCase()) {
      case 'get_available_appointments':
        return 'Laine is checking available appointments...';
      case 'schedule_appointment':
        return 'Laine is scheduling your appointment...';
      case 'check_insurance':
        return 'Laine is verifying your insurance...';
      case 'get_patient_info':
        return 'Laine is looking up your information...';
      case 'reschedule_appointment':
        return 'Laine is rescheduling your appointment...';
      case 'cancel_appointment':
        return 'Laine is canceling your appointment...';
      default:
        return `Laine is using ${toolName}...`;
    }
  };

  return (
    <div className="flex items-start space-x-3 mb-3" style={messageAnimation}>
      <div className="flex-shrink-0 w-6 h-6 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center">
        <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
      </div>
      <div className="flex-1 bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2 max-w-md">
        <p className="text-xs text-blue-700 font-medium mb-1">
          {getFriendlyMessage(toolName)}
        </p>
        <details className="text-xs">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-700 text-xs">
            Debug Details
          </summary>
          <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto whitespace-pre-wrap text-gray-600">
            Tool: {toolName}{'\n'}
            Args: {JSON.stringify(toolArgs, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

interface ToolResultCardProps {
  toolName: string;
  result: unknown;
  isSuccess: boolean;
}

function ToolResultCard({ toolName, result, isSuccess }: ToolResultCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Extract human-readable information from the result
  const getResultSummary = (toolName: string, result: unknown) => {
    if (!result || typeof result !== 'object') {
      return `Tool completed: ${toolName}`;
    }

    const resultObj = result as Record<string, unknown>;

    switch (toolName.toLowerCase()) {
      case 'findappointmenttype': {
        if (resultObj.appointmentType && typeof resultObj.appointmentType === 'object') {
          const appointmentType = resultObj.appointmentType as Record<string, unknown>;
          return `Identified Appointment: "${appointmentType.name || 'Unknown'}"`;
        }
        return 'Appointment type identified';
      }

      case 'checkavailableslots': {
        if (resultObj.availableSlots && Array.isArray(resultObj.availableSlots)) {
          const count = resultObj.availableSlots.length;
          const firstSlot = resultObj.availableSlots[0] as Record<string, unknown>;
          if (count > 0 && firstSlot?.startTime) {
            const startTime = new Date(firstSlot.startTime as string).toLocaleString();
            return `Found ${count} available slot${count > 1 ? 's' : ''} starting at ${startTime}`;
          }
          return `Found ${count} available slot${count > 1 ? 's' : ''}`;
        }
        return 'Availability checked';
      }

      case 'selectandbookslot': {
        if (resultObj.bookingConfirmation && typeof resultObj.bookingConfirmation === 'object') {
          const booking = resultObj.bookingConfirmation as Record<string, unknown>;
          if (booking.appointmentTime) {
            const appointmentTime = new Date(booking.appointmentTime as string).toLocaleString();
            return `Appointment successfully booked for ${appointmentTime}`;
          }
        }
        return 'Appointment booked successfully';
      }

      case 'identifypatient': {
        if (resultObj.patientInfo && typeof resultObj.patientInfo === 'object') {
          const patient = resultObj.patientInfo as Record<string, unknown>;
          const name = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
          return `Patient identified: ${name || 'Patient'}`;
        }
        return 'Patient identified';
      }

      case 'insuranceinfo': {
        if (resultObj.insuranceStatus) {
          return `Insurance verified: ${resultObj.insuranceStatus}`;
        }
        return 'Insurance information processed';
      }

      default: {
        // Try to extract a meaningful message from common result patterns
        if (resultObj.message && typeof resultObj.message === 'string') {
          return resultObj.message;
        }
        if (resultObj.status && typeof resultObj.status === 'string') {
          return `Status: ${resultObj.status}`;
        }
        return `${toolName} completed`;
      }
    }
  };

  const summary = getResultSummary(toolName, result);

  return (
    <div className="flex items-start space-x-3 mb-3" style={messageAnimation}>
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
        isSuccess ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
      }`}>
        {isSuccess ? (
          <CheckCircle className="w-3 h-3 text-green-500" />
        ) : (
          <XCircle className="w-3 h-3 text-red-500" />
        )}
      </div>
      <div className={`flex-1 border rounded-lg px-3 py-2 max-w-md ${
        isSuccess 
          ? 'bg-green-50/50 border-green-100' 
          : 'bg-red-50/50 border-red-100'
      }`}>
        <p className={`text-xs font-medium mb-1 ${
          isSuccess ? 'text-green-700' : 'text-red-700'
        }`}>
          {isSuccess ? '✅' : '❌'} {summary}
        </p>
        
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {showDetails ? (
            <ChevronDown className="w-3 h-3 mr-1" />
          ) : (
            <ChevronRight className="w-3 h-3 mr-1" />
          )}
          {showDetails ? 'Hide' : 'Show'} Details
        </button>

        {showDetails && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
            <div className="mb-1">
              <strong>Tool:</strong> {toolName}
            </div>
            <div className="mb-1">
              <strong>Status:</strong> {isSuccess ? 'Success' : 'Failed'}
            </div>
            <div>
              <strong>Result:</strong>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-gray-600">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ConversationViewProps {
  messages: DemoMessage[];
}

export function ConversationView({ messages }: ConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inject CSS keyframes
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = fadeInUpKeyframes;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (messages.length === 0) {
    return <WelcomeMessage />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-96">
      {messages.map((message, index) => {
        switch (message.type) {
          case 'transcript':
            return (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                style={messageAnimation}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-xl shadow-sm ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  } ${!message.isFinal ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.text}</p>
                    {!message.isFinal && (
                      <Loader2 className="w-3 h-3 ml-2 animate-spin flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                  <p className={`text-xs mt-2 ${
                    message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {message.role === 'assistant' ? 'Laine' : 'You'} • {' '}
                    {message.timestamp.toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                    {!message.isFinal && ' (typing...)'}
                  </p>
                </div>
              </div>
            );

          case 'tool-call':
            return (
              <ToolCallIndicator
                key={index}
                toolName={message.toolName}
                toolArgs={message.toolArgs}
              />
            );

          case 'tool-result':
            return (
              <ToolResultCard
                key={index}
                toolName={message.toolName}
                result={message.result}
                isSuccess={message.isSuccess}
              />
            );

          default:
            return null;
        }
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
