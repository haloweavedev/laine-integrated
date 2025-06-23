'use client'; // This page will need client-side interactivity for fetching and copying

import React, { useState, useEffect, useCallback } from 'react';
import type { DebugLogEntry } from '@/lib/debugLogStore';

interface LogData {
  callId: string | null;
  logs: DebugLogEntry[];
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
          
          {logData.logs.length > 0 ? (
            <div style={{ marginTop: '20px' }}>
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
                    border: '1px solid #ddd'
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
                        backgroundColor: '#e7f3ff', 
                        padding: '2px 6px', 
                        borderRadius: '3px',
                        marginLeft: '5px'
                      }}>
                        {entry.event}
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