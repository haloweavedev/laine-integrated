import { NextResponse } from 'next/server';
import { getLatestCallLogs, clearLatestCallLogs } from '@/lib/debugLogStore';

/**
 * GET endpoint to retrieve the latest VAPI tool call logs
 * Returns aggregated logs for the most recent call that involved tool executions
 */
export async function GET() {
  // Basic security: Check for a specific query parameter or header if you want to restrict access
  // For local development, this might not be strictly necessary, but good practice for anything potentially deployable.
  // Example:
  // const secret = request.headers.get('X-Debug-Secret');
  // if (process.env.NODE_ENV === 'production' && secret !== process.env.DEBUG_SECRET_KEY) {
  //     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  try {
    const logData = getLatestCallLogs();
    return NextResponse.json(logData, { status: 200 });
  } catch (error) {
    console.error("Error fetching latest call logs:", error);
    return NextResponse.json({ error: 'Failed to retrieve logs' }, { status: 500 });
  }
}

/**
 * DELETE endpoint to clear logs from the page if desired
 * Useful for testing or manual cleanup
 */
export async function DELETE() {
  try {
    clearLatestCallLogs();
    return NextResponse.json({ message: 'Logs cleared' }, { status: 200 });
  } catch (error) {
    console.error("Error clearing latest call logs:", error);
    return NextResponse.json({ error: 'Failed to clear logs' }, { status: 500 });
  }
} 