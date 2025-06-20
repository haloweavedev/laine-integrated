"use client";

import Vapi from "@vapi-ai/web"; // Import Vapi
import { useEffect, useState, useRef } from "react";
import type { LatestCallLogData } from "./actions";

interface TestClientProps {
  vapiAssistantId: string;
  initialPhoneNumber: string | null;
  initialLatestCallLog: LatestCallLogData | null;
}

export function TestClient({ vapiAssistantId, initialPhoneNumber, initialLatestCallLog }: TestClientProps) {
  const [isCalling, setIsCalling] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<Array<{speaker: string, text: string}>>([]);
  const [callStatus, setCallStatus] = useState("Idle");
  const [phoneNumber] = useState(initialPhoneNumber);
  const [latestCallLog] = useState(initialLatestCallLog);
  
  const vapiRef = useRef<Vapi | null>(null); // Initialize vapiRef

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY) {
      console.error("NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set.");
      setCallStatus("Error: Vapi Public Key not configured.");
      return;
    }
    const vapiInstance = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY);
    vapiRef.current = vapiInstance;

    vapiInstance.on('call-start', () => {
      console.log('Vapi call started');
      setIsCalling(true);
      setCallStatus("In Progress...");
      setLiveTranscript([]); // Clear previous transcript
    });

    vapiInstance.on('call-end', () => {
      console.log('Vapi call ended');
      setIsCalling(false);
      setCallStatus("Call Ended. Refresh to see updated log.");
      // Consider adding a server action call here to immediately fetch the latest call log
      // and update `setLatestCallLog`. For now, user needs to refresh page.
    });

    vapiInstance.on('error', (e) => {
      console.error('Vapi SDK error:', e);
      setIsCalling(false);
      setCallStatus(`Error: ${e?.message || 'Unknown Vapi error'}`);
    });

    vapiInstance.on('message', (message) => {
      // console.log('Vapi message:', message); // For debugging all messages
      if (message.type === 'transcript') {
        const role = message.role === 'assistant' ? 'Laine' : 'User';
        if (message.transcriptType === 'final') {
          setLiveTranscript(prev => [...prev, { speaker: role, text: message.transcript }]);
        }
      }
      if (message.type === 'status-update' && message.status) {
         // Example: "ringing", "in-progress", "forwarding", "ended"
        setCallStatus(message.status.charAt(0).toUpperCase() + message.status.slice(1));
      }
      // Add more message handlers if needed (e.g., 'speech-start', 'speech-end')
    });
    
    return () => {
      // Cleanup: stop call and remove listeners if component unmounts
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
      vapiInstance.removeAllListeners();
    };
  }, []); // Empty dependency array ensures this runs once on mount

  const handleStartCall = () => {
    if (vapiRef.current && vapiAssistantId) {
      setCallStatus("Starting call...");
      vapiRef.current.start(vapiAssistantId);
    }
  };

  const handleStopCall = () => {
    if (vapiRef.current) {
      setCallStatus("Stopping call...");
      vapiRef.current.stop();
    }
  };

  // Function to interpret endedReason for success/fail
  const getCallOutcome = (log: LatestCallLogData | null) => {
    if (!log || !log.endedReason) return "Status Unknown";
    if (log.endedReason.toLowerCase().includes("error") || log.endedReason.toLowerCase().includes("failed")) {
      return `Failed: ${log.endedReason}`;
    }
    if (["assistant-ended-call", "customer-ended-call", "hangup"].includes(log.endedReason.toLowerCase())) {
      return `Call completed (${log.endedReason})`;
    }
    return `Ended: ${log.endedReason}`;
  };
  
  const handleRefreshLatestCall = async () => {
    // Placeholder: In a real app, you might call a server action to re-fetch
    // For now, this button won't do anything until we implement re-fetching if needed.
    alert("Re-fetching latest call log - not yet implemented in this phase. Call data updates after a new call ends and page reloads or via live updates if implemented.");
  };

  const handlePhoneCall = () => {
    window.open('tel:+19203927291', '_self');
  };

  return (
    <div className="space-y-8">
      {/* Phone Call Component */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-xl shadow-lg">
        <div className="flex items-center justify-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 p-3 rounded-full">
              <span className="text-2xl">📞</span>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1">Talk to Laine on the Phone</h3>
              <p className="text-blue-100 text-sm">Experience our AI dental assistant over the phone</p>
            </div>
          </div>
          <button
            onClick={handlePhoneCall}
            className="bg-white text-blue-600 hover:bg-blue-50 px-6 py-3 rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-md"
          >
            <div className="flex items-center space-x-2">
              <span className="text-lg">📱</span>
              <span>+1 (920) 392 7260</span>
            </div>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">Test Your Laine Assistant</h2>
        <p className="text-sm text-gray-600 mb-1">Assistant ID: <span className="font-mono text-blue-600">{vapiAssistantId}</span></p>
        {phoneNumber && (
          <p className="text-sm text-gray-600 mb-4">
            Or, Call Laine at: <strong className="text-blue-600">{phoneNumber}</strong>
          </p>
        )}

        {/* Web Call Module Placeholder */}
        <div className="mt-4 space-x-2">
          <button 
            onClick={handleStartCall} 
            disabled={isCalling || callStatus.startsWith("Error:")}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCalling ? "Calling..." : "Start Web Call"}
          </button>
          <button
            onClick={handleStopCall} 
            disabled={!isCalling}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stop Web Call
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">Call Status: <span className="font-semibold">{callStatus}</span></p>
        
        <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200 max-h-60 overflow-y-auto">
          <h3 className="text-md font-semibold text-gray-700 mb-2">Live Transcript:</h3>
          {liveTranscript.length === 0 && <p className="text-xs text-gray-500 italic">Transcript will appear here...</p>}
          {liveTranscript.map((entry, index) => (
             <p key={index} className="text-xs text-gray-800 mb-1">
               <strong className={entry.speaker === 'Laine' ? 'text-blue-600' : 'text-green-600'}>{entry.speaker}:</strong> {entry.text}
             </p>
          ))}
        </div>
      </div>

      {/* Latest Call Info */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-slate-700">Latest Call Information</h3>
            <button 
                onClick={handleRefreshLatestCall}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
                Refresh
            </button>
        </div>
        {latestCallLog ? (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>Call Time:</strong> {new Date(latestCallLog.createdAt).toLocaleString()}
            </p>
            <p className="text-sm">
              <strong>Outcome:</strong> {getCallOutcome(latestCallLog)}
            </p>
            {latestCallLog.recordingUrl && (
              <div>
                <strong className="text-sm">Recording:</strong>
                <audio src={latestCallLog.recordingUrl} controls className="w-full mt-1" />
              </div>
            )}
            {latestCallLog.transcriptText && (
              <div>
                <strong className="text-sm">Full Transcript:</strong>
                <pre className="mt-1 text-xs bg-gray-50 p-3 rounded-md border border-gray-200 max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {latestCallLog.transcriptText}
                </pre>
              </div>
            )}
            {latestCallLog.summary && (
                <div>
                    <strong className="text-sm">Vapi Summary:</strong>
                    <p className="mt-1 text-xs bg-gray-50 p-3 rounded-md border border-gray-200 whitespace-pre-wrap">
                        {latestCallLog.summary}
                    </p>
                </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No call history found for this practice.</p>
        )}
      </div>
    </div>
  );
} 