'use client'; // This page will need client-side interactivity for fetching and copying

import React, { useState, useEffect, useCallback } from 'react';
import type { DebugLogEntry } from '@/lib/debugLogStore';

interface LogData {
  callId: string | null;
  logs: DebugLogEntry[];
}

interface TranscriptMessage {
  role: 'user' | 'bot' | 'system' | 'assistant';
  content?: string;
  message?: string; // Fallback for some formats
  duration?: number;
}

// New interface for extracted findAppointmentType data
interface FindAppointmentTypeData {
  patientRequest?: string;
  appointmentTypeName?: string;
  appointmentTypeId?: string;
  appointmentDuration?: number;
  toolResult?: string;
  toolError?: string;
  detectedIntent?: string;
  hasToolLog: boolean;
  hasCallLogUpdate: boolean;
}

export default function ToolCallLogPage() {
  const [logData, setLogData] = useState<LogData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [refreshIntervalId, setRefreshIntervalId] = useState<NodeJS.Timeout | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/debug/latest-tool-call-log');
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }
      const data: LogData = await response.json();
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

  // Extract findAppointmentType relevant data from logs
  const extractFindAppointmentTypeData = (logs: DebugLogEntry[]): FindAppointmentTypeData | null => {
    const data: FindAppointmentTypeData = {
      hasToolLog: false,
      hasCallLogUpdate: false
    };

    for (const entry of logs) {
      // Check for ToolLog entries related to findAppointmentType
      if (entry.event === 'TOOL_LOG_ENTRY' && entry.details?.toolName === 'findAppointmentType') {
        data.hasToolLog = true;
        
        // Extract tool arguments (patientRequest)
        if (entry.details.arguments) {
          try {
            const args = typeof entry.details.arguments === 'string' 
              ? JSON.parse(entry.details.arguments) 
              : entry.details.arguments;
            data.patientRequest = args.patientRequest;
          } catch (e) {
            console.warn('Could not parse tool arguments:', e);
          }
        }

        // Extract tool result or error
        data.toolResult = entry.details.result;
        data.toolError = entry.details.error;
      }

      // Check for CallLog updates that might contain appointment type information
      if (entry.event === 'CALL_LOG_UPDATE' && entry.details) {
        if (entry.details.lastAppointmentTypeName || entry.details.lastAppointmentTypeId || entry.details.lastAppointmentDuration) {
          data.hasCallLogUpdate = true;
          data.appointmentTypeName = entry.details.lastAppointmentTypeName;
          data.appointmentTypeId = entry.details.lastAppointmentTypeId;
          data.appointmentDuration = entry.details.lastAppointmentDuration;
          data.detectedIntent = entry.details.detectedIntent;
        }
      }

      // Also check if findAppointmentType data is embedded in other event types
      if (entry.details && typeof entry.details === 'object') {
        if (entry.details.lastAppointmentTypeName && !data.hasCallLogUpdate) {
          data.hasCallLogUpdate = true;
          data.appointmentTypeName = entry.details.lastAppointmentTypeName;
          data.appointmentTypeId = entry.details.lastAppointmentTypeId;
          data.appointmentDuration = entry.details.lastAppointmentDuration;
          data.detectedIntent = entry.details.detectedIntent;
        }
      }
    }

    // Return data only if we found relevant information
    return data.hasToolLog || data.hasCallLogUpdate ? data : null;
  };

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

  // Render findAppointmentType debug section
  const renderFindAppointmentTypeDebug = (data: FindAppointmentTypeData) => (
    <div style={{
      backgroundColor: '#f0f8ff',
      border: '2px solid #007bff',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '20px'
    }}>
      <h3 style={{
        margin: '0 0 15px 0',
        color: '#0056b3',
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        borderBottom: '2px solid #007bff',
        paddingBottom: '8px'
      }}>
        🔍 findAppointmentType Tool Debug Summary
      </h3>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '15px', 
        fontFamily: 'Arial, sans-serif' 
      }}>
        <div style={{
          backgroundColor: '#e7f3ff',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #b3d9ff'
        }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#0056b3', fontSize: '14px' }}>📥 Input</h4>
          <div style={{ fontSize: '13px' }}>
            <strong>Patient Request:</strong><br />
            <code style={{ 
              backgroundColor: '#fff', 
              padding: '4px 6px', 
              borderRadius: '3px',
              fontSize: '12px',
              wordBreak: 'break-word'
            }}>
              {data.patientRequest || 'Not available'}
            </code>
          </div>
          {data.detectedIntent && (
            <div style={{ fontSize: '13px', marginTop: '8px' }}>
              <strong>Detected Intent:</strong><br />
              <code style={{ 
                backgroundColor: '#fff', 
                padding: '4px 6px', 
                borderRadius: '3px',
                fontSize: '12px',
                wordBreak: 'break-word'
              }}>
                {data.detectedIntent}
              </code>
            </div>
          )}
        </div>

        <div style={{
          backgroundColor: '#e8f5e8',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #a8d5a8'
        }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#155724', fontSize: '14px' }}>🎯 Database Match</h4>
          {data.appointmentTypeName ? (
            <>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}>
                <strong>Appointment Type:</strong><br />
                <code style={{ 
                  backgroundColor: '#fff', 
                  padding: '4px 6px', 
                  borderRadius: '3px',
                  fontSize: '12px'
                }}>
                  {data.appointmentTypeName}
                </code>
              </div>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}>
                <strong>ID:</strong> <code style={{ fontSize: '11px' }}>{data.appointmentTypeId || 'N/A'}</code>
              </div>
              <div style={{ fontSize: '13px' }}>
                <strong>Duration:</strong> <code style={{ fontSize: '11px' }}>{data.appointmentDuration ? `${data.appointmentDuration} minutes` : 'N/A'}</code>
              </div>
            </>
          ) : (
            <div style={{ fontSize: '13px', color: '#856404' }}>
              No appointment type match found
            </div>
          )}
        </div>
      </div>

      <div style={{
        marginTop: '15px',
        backgroundColor: data.toolError ? '#f8d7da' : '#d1edff',
        padding: '12px',
        borderRadius: '6px',
        border: `1px solid ${data.toolError ? '#f5c6cb' : '#b3d9ff'}`
      }}>
        <h4 style={{ 
          margin: '0 0 8px 0', 
          color: data.toolError ? '#721c24' : '#0056b3', 
          fontSize: '14px' 
        }}>
          {data.toolError ? '❌ Tool Error' : '✅ Tool Result'}
        </h4>
        <pre style={{
          margin: '0',
          fontSize: '12px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          backgroundColor: '#fff',
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid #ddd',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          {data.toolError || data.toolResult || 'No result available'}
        </pre>
      </div>

      <div style={{
        marginTop: '10px',
        fontSize: '12px',
        color: '#6c757d',
        fontFamily: 'Arial, sans-serif'
      }}>
        <strong>Debug Status:</strong> 
        {data.hasToolLog && <span style={{ color: '#28a745', marginLeft: '5px' }}>✓ Tool execution logged</span>}
        {data.hasCallLogUpdate && <span style={{ color: '#28a745', marginLeft: '10px' }}>✓ Call log updated</span>}
        {!data.hasToolLog && !data.hasCallLogUpdate && <span style={{ color: '#dc3545', marginLeft: '5px' }}>⚠ Incomplete debug data</span>}
      </div>
    </div>
  );

  if (isLoading && !logData) { // Show loading only on initial load
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        Loading logs...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red', fontFamily: 'Arial, sans-serif' }}>
        Error loading logs: {error}
      </div>
    );
  }

  const findAppointmentTypeData = logData ? extractFindAppointmentTypeData(logData.logs) : null;

  return (
    <div style={{ 
      fontFamily: 'monospace', 
      padding: '20px', 
      whiteSpace: 'pre-wrap', 
      wordBreak: 'break-all',
      backgroundColor: '#f8f9fa',
      minHeight: '100vh'
    }}>
      <h1 style={{ 
        fontFamily: 'Arial, sans-serif', 
        color: '#333', 
        borderBottom: '2px solid #ddd',
        paddingBottom: '10px'
      }}>
        Latest VAPI Tool Call Log
      </h1>
      
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
          disabled={!logData || logData.logs.length === 0} 
          style={{ 
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: (!logData || logData.logs.length === 0) ? '#6c757d' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (!logData || logData.logs.length === 0) ? 'not-allowed' : 'pointer'
          }}
        >
          Copy Logs
        </button>
        
        <button 
          onClick={clearLogsOnServer} 
          disabled={!logData || !logData.callId} 
          style={{ 
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: (!logData || !logData.callId) ? '#6c757d' : '#ffc107',
            color: (!logData || !logData.callId) ? 'white' : '#212529',
            border: 'none',
            borderRadius: '4px',
            cursor: (!logData || !logData.callId) ? 'not-allowed' : 'pointer'
          }}
        >
          Clear Server Logs
        </button>
        
        <label style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'Arial, sans-serif' }}>
          <input 
            type="checkbox" 
            checked={autoRefresh} 
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ marginRight: '5px' }}
          />
          Auto-refresh (5s)
        </label>
      </div>

      {logData && logData.callId ? (
        <>
          <h2 style={{ 
            fontFamily: 'Arial, sans-serif', 
            color: '#495057',
            backgroundColor: '#e9ecef',
            padding: '10px',
            borderRadius: '4px',
            borderLeft: '4px solid #007bff'
          }}>
            Call ID: {logData.callId}
          </h2>

          {/* Enhanced findAppointmentType Debug Section */}
          {findAppointmentTypeData && renderFindAppointmentTypeDebug(findAppointmentTypeData)}
          
          {logData.logs.length > 0 ? (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{
                fontFamily: 'Arial, sans-serif',
                color: '#495057',
                borderBottom: '1px solid #ddd',
                paddingBottom: '5px',
                marginBottom: '15px'
              }}>
                Raw Log Entries
              </h3>
              
              {logData.logs.map((entry, index) => (
                <div 
                  key={index} 
                  style={{ 
                    borderBottom: '1px solid #dee2e6', 
                    paddingBottom: '15px', 
                    marginBottom: '15px',
                    backgroundColor: '#fff',
                    padding: '15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    // Highlight findAppointmentType related entries
                    ...(entry.details?.toolName === 'findAppointmentType' || 
                        (entry.details?.lastAppointmentTypeName) ? {
                      borderLeft: '4px solid #007bff',
                      backgroundColor: '#f8f9ff'
                    } : {})
                  }}
                >
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '10px', 
                    marginBottom: '10px',
                    fontFamily: 'Arial, sans-serif'
                  }}>
                    <p style={{ margin: '0' }}>
                      <strong>Timestamp:</strong> {new Date(entry.timestamp).toLocaleString()}
                    </p>
                    <p style={{ margin: '0' }}>
                      <strong>Event:</strong> 
                      <span style={{ 
                        backgroundColor: entry.details?.toolName === 'findAppointmentType' ? '#007bff' : '#e7f3ff', 
                        color: entry.details?.toolName === 'findAppointmentType' ? 'white' : 'inherit',
                        padding: '2px 6px', 
                        borderRadius: '3px',
                        marginLeft: '5px'
                      }}>
                        {entry.event}
                        {entry.details?.toolName === 'findAppointmentType' && ' (findAppointmentType)'}
                      </span>
                    </p>
                  </div>
                  
                  {entry.source && (
                    <p style={{ margin: '0 0 10px 0', fontFamily: 'Arial, sans-serif' }}>
                      <strong>Source:</strong> 
                      <span style={{ 
                        backgroundColor: '#f8f9fa', 
                        padding: '2px 6px', 
                        borderRadius: '3px',
                        marginLeft: '5px'
                      }}>
                        {entry.source}
                      </span>
                    </p>
                  )}
                  
                  {entry.event === 'RAW_VAPI_PAYLOAD' && entry.details?.payloadString && (
                    (() => {
                      try {
                        const payload = JSON.parse(entry.details.payloadString);
                        const messages = payload?.message?.artifact?.messagesOpenAIFormatted || payload?.message?.artifact?.messages;
                        if (Array.isArray(messages) && messages.length > 0) {
                          return (
                            <div style={{ marginTop: '10px', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
                              <strong style={{ fontFamily: 'Arial, sans-serif', color: '#007bff' }}>Conversation Transcript (from RAW_VAPI_PAYLOAD):</strong>
                              <pre style={{
                                backgroundColor: '#e9f5ff',
                                padding: '10px',
                                borderRadius: '4px',
                                border: '1px solid #bee5eb',
                                fontSize: '12px',
                                lineHeight: '1.5',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                              }}>
                                {messages.map((msg: TranscriptMessage, msgIdx: number) => (
                                  <React.Fragment key={msgIdx}>
                                    {msgIdx > 0 && <hr style={{border:0, borderTop:'1px dotted #ddd', margin:'5px 0'}}/>}
                                    <div style={{ marginBottom: '5px' }}>
                                      <span style={{ fontWeight: 'bold', color: msg.role === 'user' ? 'green' : 'purple' }}>
                                        {msg.role === 'bot' ? 'Laine' : msg.role}:
                                      </span>{' '}
                                      {msg.content || msg.message}
                                      {msg.duration && <span style={{fontSize: '0.8em', color: '#777'}}> ({ (msg.duration / 1000).toFixed(1)}s)</span>}
                                    </div>
                                  </React.Fragment>
                                ))}
                              </pre>
                            </div>
                          );
                        }
                      } catch (e) {
                        console.warn("Could not parse payloadString for transcript", e);
                      }
                      return null;
                    })()
                  )}

                  <div>
                    <strong style={{ fontFamily: 'Arial, sans-serif' }}>Details:</strong>
                    <pre style={{ 
                      backgroundColor: '#f8f9fa', 
                      padding: '15px', 
                      borderRadius: '6px', 
                      overflowX: 'auto',
                      border: '1px solid #e9ecef',
                      fontSize: '13px',
                      lineHeight: '1.4'
                    }}>
                      {typeof entry.details === 'object' 
                        ? JSON.stringify(entry.details, null, 2) 
                        : String(entry.details)
                      }
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ 
              padding: '20px', 
              backgroundColor: '#fff3cd', 
              borderRadius: '8px',
              border: '1px solid #ffeaa7',
              color: '#856404',
              fontFamily: 'Arial, sans-serif'
            }}>
              No log entries found for this call ID.
            </div>
          )}
        </>
      ) : (
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#d1ecf1', 
          borderRadius: '8px',
          border: '1px solid #bee5eb',
          color: '#0c5460',
          fontFamily: 'Arial, sans-serif'
        }}>
          No call logs available yet. Make a VAPI call involving tools to see logs here.
        </div>
      )}
    </div>
  );
} 