'use client'; // This page will need client-side interactivity for fetching and copying

import React, { useState, useEffect, useCallback } from 'react';

// New TypeScript interfaces for the refactored debugging dashboard
interface TranscriptMessageLog {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface ToolExecutionLogEntry {
  toolLogId: string;
  toolCallId: string;
  toolName: string;
  timestamp: string;
  arguments: Record<string, unknown>;
  aiMatcherInputQuery?: string;
  aiMatcherOutputId?: string | null;
  aiResponderOutputMessage?: string;
  resultSentToVapi?: string | null;
  errorSentToVapi?: string | null;
  success: boolean;
  executionTimeMs?: number;
}

interface CallLogSummary {
  detectedIntent?: string;
  lastAppointmentTypeId?: string;
  lastAppointmentTypeName?: string;
  lastAppointmentDuration?: number;
  callStatus?: string;
  nexhealthPatientId?: string;
  bookedAppointmentNexhealthId?: string;
  assistantId?: string;
  endedReason?: string;
  callDurationSeconds?: number;
  cost?: number;
}

interface DetailedCallDebugData {
  callId: string;
  practiceId?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  transcript: TranscriptMessageLog[];
  callLogSummary?: CallLogSummary;
  toolExecutions: ToolExecutionLogEntry[];
}

export default function ToolCallLogPage() {
  const [logData, setLogData] = useState<DetailedCallDebugData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [refreshIntervalId, setRefreshIntervalId] = useState<NodeJS.Timeout | null>(null);

  // Collapsible section state management
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isCallLogOpen, setIsCallLogOpen] = useState(false);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      // Updated to fetch from new structured debug API endpoint
      const response = await fetch('/api/debug/latest-tool-call-log');
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }
      const data: DetailedCallDebugData = await response.json();
      setLogData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setLogData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      const intervalId = setInterval(fetchLogs, 5000); // Refresh every 5 seconds
      setRefreshIntervalId(intervalId);
      return () => clearInterval(intervalId);
    } else {
      if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        setRefreshIntervalId(null);
      }
    }
  }, [autoRefresh, fetchLogs, refreshIntervalId]);

  const copyLogsToClipboard = () => {
    if (logData) {
      const logString = JSON.stringify(logData, null, 2);
      navigator.clipboard.writeText(logString)
        .then(() => alert('Logs copied to clipboard!'))
        .catch(err => alert('Failed to copy logs: ' + err));
    }
  };
  
  const clearLogsOnServer = async () => {
    if (confirm('Are you sure you want to clear the logs on the server?')) {
      try {
        const response = await fetch('/api/debug/latest-tool-call-log', { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to clear logs on server.');
        alert('Logs cleared on server. Refreshing...');
        fetchLogs(); // Refresh to show cleared state
      } catch (err) {
        alert('Error clearing logs: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    }
  };

  if (isLoading && !logData) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        Loading call debug details...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red', fontFamily: 'Arial, sans-serif' }}>
        Error loading call debug details: {error}
      </div>
    );
  }

  return (
    <div style={{ 
      fontFamily: 'Arial, sans-serif', 
      padding: '20px', 
      backgroundColor: '#f8f9fa',
      minHeight: '100vh'
    }}>
      <h1 style={{ 
        color: '#333', 
        borderBottom: '2px solid #ddd',
        paddingBottom: '10px',
        marginBottom: '20px'
      }}>
        Latest Call Debug Dashboard
      </h1>
      
      {/* Action Buttons */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '15px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #ddd'
      }}>
        <button 
          onClick={fetchLogs} 
          disabled={isLoading} 
          style={{ 
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: isLoading ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Logs'}
        </button>
        
        <button 
          onClick={copyLogsToClipboard} 
          disabled={!logData} 
          style={{ 
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: !logData ? '#6c757d' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !logData ? 'not-allowed' : 'pointer'
          }}
        >
          Copy Logs
        </button>
        
        <button 
          onClick={clearLogsOnServer} 
          disabled={!logData?.callId} 
          style={{ 
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: !logData?.callId ? '#6c757d' : '#ffc107',
            color: !logData?.callId ? 'white' : '#212529',
            border: 'none',
            borderRadius: '4px',
            cursor: !logData?.callId ? 'not-allowed' : 'pointer'
          }}
        >
          Clear Server Logs
        </button>
        
        <label style={{ display: 'inline-flex', alignItems: 'center' }}>
          <input 
            type="checkbox" 
            checked={autoRefresh} 
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ marginRight: '5px' }}
          />
          Auto-refresh (5s)
        </label>
      </div>

      {logData ? (
        <>
          {/* General Call Information */}
          <div style={{
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h2 style={{ 
              margin: '0 0 15px 0',
              color: '#495057',
              borderBottom: '1px solid #ddd',
              paddingBottom: '10px'
            }}>
              📞 General Call Information
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div><strong>Call ID:</strong> <code>{logData.callId}</code></div>
              <div><strong>Practice ID:</strong> <code>{logData.practiceId || 'N/A'}</code></div>
              <div><strong>Start Time:</strong> {logData.startTime ? new Date(logData.startTime).toLocaleString() : 'N/A'}</div>
              <div><strong>End Time:</strong> {logData.endTime ? new Date(logData.endTime).toLocaleString() : 'N/A'}</div>
              <div><strong>Status:</strong> <span style={{
                backgroundColor: logData.status === 'ENDED' ? '#d4edda' : '#fff3cd',
                color: logData.status === 'ENDED' ? '#155724' : '#856404',
                padding: '2px 8px',
                borderRadius: '4px'
              }}>{logData.status || 'N/A'}</span></div>
            </div>
          </div>

          {/* Conversation Transcript */}
          <div style={{
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h2 
              onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
              style={{ 
                margin: '0 0 15px 0',
                color: '#495057',
                borderBottom: '1px solid #ddd',
                paddingBottom: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              💬 Conversation Transcript ({logData.transcript?.length || 0} messages)
              <span style={{ fontSize: '14px' }}>{isTranscriptOpen ? '▼' : '▶'}</span>
            </h2>
            
            {isTranscriptOpen && (
              <>
                {logData.transcript && logData.transcript.length > 0 ? (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {logData.transcript.map((msg, index) => (
                      <div 
                        key={index}
                        style={{
                          padding: '10px',
                          margin: '8px 0',
                          borderRadius: '8px',
                          backgroundColor: msg.role === 'user' ? '#e6ffed' : '#e6f7ff',
                          border: `1px solid ${msg.role === 'user' ? '#b3e6b3' : '#b3d9ff'}`
                        }}
                      >
                        <strong style={{ color: msg.role === 'user' ? '#155724' : '#004085' }}>
                          {msg.role === 'assistant' ? 'Laine' : 'User'}:
                        </strong> {msg.content}
                        {msg.timestamp && (
                          <span style={{ fontSize: '0.8em', color: '#777', marginLeft: '10px' }}>
                            ({new Date(msg.timestamp).toLocaleTimeString()})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
                    No transcript available for this call.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Tool Executions */}
          <div style={{
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h2 
              onClick={() => setIsToolsOpen(!isToolsOpen)}
              style={{ 
                margin: '0 0 15px 0',
                color: '#495057',
                borderBottom: '1px solid #ddd',
                paddingBottom: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              🔧 Tool Executions ({logData.toolExecutions?.length || 0})
              <span style={{ fontSize: '14px' }}>{isToolsOpen ? '▼' : '▶'}</span>
            </h2>
            
            {isToolsOpen && (
              <>
                {logData.toolExecutions && logData.toolExecutions.length > 0 ? (
                  <div>
                    {logData.toolExecutions.map((toolExecution, index) => (
                      <div 
                        key={index}
                        style={{
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          padding: '15px',
                          marginBottom: '15px',
                          backgroundColor: '#f8f9fa'
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <div><strong>Tool:</strong> <code>{toolExecution.toolName}</code></div>
                          <div><strong>Invocation ID:</strong> <code style={{ fontSize: '12px' }}>{toolExecution.toolCallId}</code></div>
                          <div><strong>Timestamp:</strong> {new Date(toolExecution.timestamp).toLocaleString()}</div>
                          <div>
                            <strong>Status:</strong> 
                            <span style={{
                              backgroundColor: toolExecution.success ? '#d4edda' : '#f8d7da',
                              color: toolExecution.success ? '#155724' : '#721c24',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              marginLeft: '5px'
                            }}>
                              {toolExecution.success ? 'Success' : 'Failed'}
                            </span>
                          </div>
                        </div>
                        
                        {toolExecution.executionTimeMs != null && (
                          <div style={{ marginBottom: '10px' }}>
                            <strong>Execution Time:</strong> {toolExecution.executionTimeMs}ms
                          </div>
                        )}
                        
                        <div style={{ marginBottom: '10px' }}>
                          <strong>Arguments:</strong>
                          <pre style={{
                            backgroundColor: '#fff',
                            padding: '10px',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            fontSize: '12px',
                            overflow: 'auto'
                          }}>
                            {JSON.stringify(toolExecution.arguments, null, 2)}
                          </pre>
                        </div>

                        {/* Conditional AI Details for findAppointmentType */}
                        {toolExecution.toolName === 'findAppointmentType' && (
                          <>
                            {(toolExecution.aiMatcherInputQuery || toolExecution.aiMatcherOutputId) && (
                              <div style={{ marginBottom: '10px' }}>
                                <strong>AI Matcher Details:</strong>
                                <div style={{ marginLeft: '10px', marginTop: '5px' }}>
                                  <div><strong>Input Query:</strong> <code>{toolExecution.aiMatcherInputQuery || 'N/A'}</code></div>
                                  <div><strong>Output ID:</strong> <code>{toolExecution.aiMatcherOutputId || 'N/A'}</code></div>
                                </div>
                              </div>
                            )}
                            
                            {toolExecution.aiResponderOutputMessage && (
                              <div style={{ marginBottom: '10px' }}>
                                <strong>AI Responder Output Message:</strong>
                                <pre style={{
                                  backgroundColor: '#e6f7ff',
                                  padding: '10px',
                                  borderRadius: '4px',
                                  border: '1px solid #b3d9ff',
                                  fontSize: '12px'
                                }}>
                                  {toolExecution.aiResponderOutputMessage}
                                </pre>
                              </div>
                            )}
                          </>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <strong>Result Sent to VAPI:</strong>
                            <pre style={{
                              backgroundColor: '#fff',
                              padding: '8px',
                              borderRadius: '4px',
                              border: '1px solid #ddd',
                              fontSize: '12px',
                              maxHeight: '150px',
                              overflow: 'auto'
                            }}>
                              {toolExecution.resultSentToVapi || 'N/A'}
                            </pre>
                          </div>
                          <div>
                            <strong>Error Sent to VAPI:</strong>
                            <pre style={{
                              backgroundColor: toolExecution.errorSentToVapi ? '#f8d7da' : '#fff',
                              padding: '8px',
                              borderRadius: '4px',
                              border: '1px solid #ddd',
                              fontSize: '12px',
                              maxHeight: '150px',
                              overflow: 'auto'
                            }}>
                              {toolExecution.errorSentToVapi || 'N/A'}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
                    No tool executions logged for this call.
                  </p>
                )}
              </>
            )}
          </div>

          {/* CallLog Summary */}
          <div style={{
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h2 
              onClick={() => setIsCallLogOpen(!isCallLogOpen)}
              style={{ 
                margin: '0 0 15px 0',
                color: '#495057',
                borderBottom: '1px solid #ddd',
                paddingBottom: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              📋 Call Outcome Summary (from CallLog)
              <span style={{ fontSize: '14px' }}>{isCallLogOpen ? '▼' : '▶'}</span>
            </h2>
            
            {isCallLogOpen && (
              <>
                {logData.callLogSummary ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div><strong>Detected Intent:</strong> <code>{logData.callLogSummary.detectedIntent || 'N/A'}</code></div>
                    <div><strong>Last Identified Appointment Type:</strong> <code>{logData.callLogSummary.lastAppointmentTypeName || 'N/A'}</code></div>
                    <div><strong>Appointment Type ID:</strong> <code>{logData.callLogSummary.lastAppointmentTypeId || 'N/A'}</code></div>
                    <div><strong>Appointment Duration:</strong> <code>{logData.callLogSummary.lastAppointmentDuration != null ? logData.callLogSummary.lastAppointmentDuration + ' mins' : 'N/A'}</code></div>
                    <div><strong>Final Call Status:</strong> <code>{logData.callLogSummary.callStatus || 'N/A'}</code></div>
                    <div><strong>NexHealth Patient ID:</strong> <code>{logData.callLogSummary.nexhealthPatientId || 'N/A'}</code></div>
                    <div><strong>Booked Appointment ID:</strong> <code>{logData.callLogSummary.bookedAppointmentNexhealthId || 'N/A'}</code></div>
                    <div><strong>Assistant ID:</strong> <code>{logData.callLogSummary.assistantId || 'N/A'}</code></div>
                    <div><strong>End Reason:</strong> <code>{logData.callLogSummary.endedReason || 'N/A'}</code></div>
                    <div><strong>Call Duration:</strong> <code>{logData.callLogSummary.callDurationSeconds != null ? Math.floor(logData.callLogSummary.callDurationSeconds / 60) + 'm ' + (logData.callLogSummary.callDurationSeconds % 60) + 's' : 'N/A'}</code></div>
                    <div><strong>Cost:</strong> <code>{logData.callLogSummary.cost != null ? '$' + logData.callLogSummary.cost.toFixed(4) : 'N/A'}</code></div>
                  </div>
                ) : (
                  <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
                    No call summary data available.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#d1ecf1', 
          borderRadius: '8px',
          border: '1px solid #bee5eb',
          color: '#0c5460'
        }}>
          No call debug data available yet. Make a VAPI call involving tools to see detailed information here.
        </div>
      )}
    </div>
  );
}
