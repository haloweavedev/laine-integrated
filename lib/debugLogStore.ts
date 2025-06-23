/**
 * Debug Log Store for VAPI Tool Call Debugging
 * 
 * Provides in-memory storage for detailed logs of the most recent VAPI call
 * that involved tool executions. Used for debugging and analysis.
 */

export interface DebugLogEntry {
  timestamp: string; // ISO string
  event: string;     // e.g., "VAPI_REQUEST_RECEIVED", "TOOL_EXEC_START", "STATE_UPDATE", "VAPI_RESPONSE_SENT"
  source?: string;    // e.g., "ToolCallRoute", "executeToolSafely", "get_intent"
  details: any;      // eslint-disable-line @typescript-eslint/no-explicit-any
  vapiCallId?: string; // To associate with a specific call
}

// In-memory store - module level variables that persist across requests
let latestCallId: string | null = null;
let latestCallLogs: DebugLogEntry[] = [];

/**
 * Add a new log entry for the current VAPI call
 * If this is a new call ID, clears old logs first
 */
export function addLogEntry(entry: Omit<DebugLogEntry, 'timestamp' | 'vapiCallId'>, currentVapiCallId: string): void {
  // If this is a new call ID, clear old logs
  if (latestCallId !== currentVapiCallId) {
    latestCallId = currentVapiCallId;
    latestCallLogs = [];
  }

  const newEntry: DebugLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    vapiCallId: currentVapiCallId,
  };
  
  latestCallLogs.push(newEntry);
  
  // Optional: Limit log size to prevent memory issues
  if (latestCallLogs.length > 200) {
    latestCallLogs = latestCallLogs.slice(-200);
  }
}

/**
 * Get the logs for the latest call
 * Returns a copy to prevent external modification
 */
export function getLatestCallLogs(): { callId: string | null; logs: DebugLogEntry[] } {
  return { 
    callId: latestCallId, 
    logs: [...latestCallLogs] // Return a copy
  };
}

/**
 * Clear all stored logs
 * Useful for testing or manual cleanup
 */
export function clearLatestCallLogs(): void {
  latestCallId = null;
  latestCallLogs = [];
} 