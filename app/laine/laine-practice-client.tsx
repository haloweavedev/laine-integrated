"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Practice {
  id: string;
  name: string | null;
  assistantConfig: {
    id: string;
    vapiAssistantId: string | null;
    voiceProvider: string;
    voiceId: string;
    systemPrompt: string;
    firstMessage: string;
  } | null;
}

interface ToolResult {
  message_to_patient?: string;
  error_code?: string;
  details?: string;
  success?: boolean;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ToolLog {
  id: string;
  toolName: string;
  arguments: Record<string, unknown> | null;
  result: ToolResult | null;
  success: boolean;
  error: string | null;
  executionTimeMs: number | null;
  createdAt: string;
  toolCallId: string;
}

interface LainePracticeClientProps {
  practice: Practice;
  hasAssistant: boolean;
  createPracticeAssistant: () => Promise<void>;
}

export function LainePracticeClient({ practice, hasAssistant, createPracticeAssistant }: LainePracticeClientProps) {
  const [voiceProvider, setVoiceProvider] = useState(practice.assistantConfig?.voiceProvider || "vapi");
  const [voiceId, setVoiceId] = useState(practice.assistantConfig?.voiceId || "Elliot");
  const [systemPrompt, setSystemPrompt] = useState(practice.assistantConfig?.systemPrompt || "You are a helpful AI assistant for a dental practice. Your primary goal is to assist patients. Be polite and efficient.");
  const [firstMessage, setFirstMessage] = useState(practice.assistantConfig?.firstMessage || "Hello! This is Laine from your dental office. How can I help you today?");
  const [isUpdating, setIsUpdating] = useState(false);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [callId, setCallId] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const response = await fetch('/api/laine-config/recent-tool-logs');
        if (response.ok) {
          const data = await response.json();
          setToolLogs(data.logs || []);
          setCallId(data.callId || null);
        } else {
          toast.error("Failed to fetch recent tool logs.");
        }
      } catch (error) {
        console.error("Error fetching tool logs:", error);
        toast.error("Error fetching tool logs.");
      } finally {
        setIsLoadingLogs(false);
      }
    };
    fetchLogs();
  }, []);

  const handleUpdateConfig = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsUpdating(true);

    try {
      const response = await fetch('/api/laine-config/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voiceProvider,
          voiceId,
          systemPrompt,
          firstMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update assistant configuration');
      }

      toast.success("Assistant configuration updated successfully!");
    } catch (error) {
      console.error('Error updating assistant configuration:', error);
      toast.error(`Failed to update assistant configuration. ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!hasAssistant) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Create Your AI Assistant</h2>
        <p className="text-gray-600 mb-6">
          Create a personalized AI assistant for your practice. Laine will help patients with basic inquiries,
          patient lookups, and appointment scheduling.
        </p>
        
        <form action={createPracticeAssistant}>
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Create Laine Assistant
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-6">Configure Your AI Assistant</h2>
      
      <form onSubmit={handleUpdateConfig} className="space-y-6">
        <div>
          <label htmlFor="voiceProvider" className="block text-sm font-medium text-gray-700 mb-2">
            Voice Provider
          </label>
          <select
            id="voiceProvider"
            name="voiceProvider"
            value={voiceProvider}
            onChange={(e) => setVoiceProvider(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="vapi">VAPI (Recommended)</option>
            <option value="11labs">ElevenLabs</option>
            <option value="openai">OpenAI</option>
            <option value="playht">PlayHT</option>
          </select>
        </div>

        <div>
          <label htmlFor="voiceId" className="block text-sm font-medium text-gray-700 mb-2">
            Voice ID
          </label>
          <input
            type="text"
            id="voiceId"
            name="voiceId"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder="e.g., Elliot, Kylie (VAPI), burt (ElevenLabs), alloy (OpenAI)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-sm text-gray-500 mt-1">
            <strong>VAPI:</strong> Elliot, Kylie &nbsp;|&nbsp; 
            <strong>ElevenLabs:</strong> burt &nbsp;|&nbsp; 
            <strong>OpenAI:</strong> alloy, echo, fable, onyx, nova, shimmer
          </p>
        </div>

        <div>
          <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700 mb-2">
            System Prompt
          </label>
          <textarea
            id="systemPrompt"
            name="systemPrompt"
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Instructions that define how the AI should behave..."
          />
          <p className="text-sm text-gray-500 mt-1">
            Define how Laine should behave and what it should know about your practice
          </p>
        </div>

        <div>
          <label htmlFor="firstMessage" className="block text-sm font-medium text-gray-700 mb-2">
            First Message
          </label>
          <input
            type="text"
            id="firstMessage"
            name="firstMessage"
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Hello! This is Laine from your dental office..."
          />
          <p className="text-sm text-gray-500 mt-1">
            The first thing Laine says when answering a call
          </p>
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Assistant ID: {practice.assistantConfig?.vapiAssistantId}
          </div>
          <button
            type="submit"
            disabled={isUpdating}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? 'Updating...' : 'Update Configuration'}
          </button>
        </div>
      </form>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-2">Available Tools (8)</h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>find_patient_in_ehr - Searches for existing patients.</li>
          <li>create_new_patient - Creates new patient records (now with optional insurance name).</li>
          <li>find_appointment_type - Matches patient requests to appointment types.</li>
          <li>check_available_slots - Finds available appointment times.</li>
          <li>book_appointment - Books the selected appointment.</li>
          <li>check_insurance_participation - Checks if practice accepts patient&apos;s insurance.</li>
          <li>get_service_cost_estimate - Provides estimated service costs.</li>
          <li>get_practice_details - Retrieves practice address and other details.</li>
        </ul>
      </div>

      {/* Recent Tool Call Activity Section */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-4">Recent Tool Call Activity</h3>
        {isLoadingLogs && (
          <p className="text-sm text-gray-600">Loading recent activity...</p>
        )}
        {!isLoadingLogs && toolLogs.length === 0 && (
          <p className="text-sm text-gray-600">No recent tool call activity found.</p>
        )}
        {!isLoadingLogs && toolLogs.length > 0 && (
          <div className="space-y-4">
            {callId && (
              <p className="text-xs text-gray-500 mb-3">
                Call ID: {callId} • {toolLogs.length} tool{toolLogs.length !== 1 ? 's' : ''} executed
              </p>
            )}
            {toolLogs.map((log) => (
              <div key={log.id} className="p-3 bg-white rounded border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-sm text-gray-900">{log.toolName}</h4>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span className={`px-2 py-1 rounded ${log.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {log.success ? 'Success' : 'Failed'}
                    </span>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                    {log.executionTimeMs && <span>{log.executionTimeMs}ms</span>}
                  </div>
                </div>
                
                {/* Arguments */}
                {log.arguments && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">Arguments:</p>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.arguments, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Result */}
                {log.result && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">Result:</p>
                    {log.result?.message_to_patient && (
                      <p className="text-sm italic text-blue-600 mb-1">
                        To Patient: &quot;{log.result.message_to_patient}&quot;
                      </p>
                    )}
                    {log.result?.error_code && (
                      <p className="text-sm text-red-600 mb-1">
                        Error: {log.result.error_code} - {log.result.details || 'No details'}
                      </p>
                    )}
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Error (if failed) */}
                {log.error && (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                    <strong>Error:</strong> {log.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 