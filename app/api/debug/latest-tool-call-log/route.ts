import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface DetailedCallDebugData {
  callId: string | null;
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
    context?: Record<string, unknown>;
  }>;
  callLog?: {
    vapiCallId: string;
    practiceId: string;
    callStatus: string | null;
    detectedIntent?: string | null;
    lastAppointmentTypeId?: string | null;
    lastAppointmentTypeName?: string | null;
    lastAppointmentDuration?: number | null;
    callTimestampStart?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  toolLogs?: Array<{
    toolCallId: string;
    toolName: string;
    arguments: string | null;
    result?: string | null;
    error?: string | null;
    success: boolean;
    executionTimeMs?: number | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

/**
 * GET endpoint to retrieve the latest VAPI tool call logs
 * Returns aggregated logs for the most recent call that involved tool executions
 */
export async function GET() {
  try {
    // Find the most recent CallLog that has associated ToolLogs
    const latestCallWithTools = await prisma.callLog.findFirst({
      where: {
        toolLogs: {
          some: {} // Has at least one tool log
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      include: {
        toolLogs: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    if (!latestCallWithTools) {
      // No calls with tool interactions found
      const emptyResponse: DetailedCallDebugData = {
        callId: null,
        logs: []
      };
      return NextResponse.json(emptyResponse, { status: 200 });
    }

    // Transform the data into the expected format
    const logs: DetailedCallDebugData['logs'] = [];
    
    // Add call start log
    logs.push({
      timestamp: latestCallWithTools.createdAt.toISOString(),
      level: 'info',
      message: `Call started for practice ${latestCallWithTools.practiceId}`,
      context: {
        callId: latestCallWithTools.vapiCallId,
        practiceId: latestCallWithTools.practiceId,
        status: latestCallWithTools.callStatus
      }
    });

    // Add tool execution logs
    for (const toolLog of latestCallWithTools.toolLogs) {
      // Tool call start
      logs.push({
        timestamp: toolLog.createdAt.toISOString(),
        level: 'info',
        message: `Tool ${toolLog.toolName} called`,
                          context: {
           toolCallId: toolLog.toolCallId,
           toolName: toolLog.toolName,
           arguments: toolLog.arguments || "{}"
         }
      });

      // Tool call result
      const resultLevel = toolLog.success ? 'info' : 'error';
      const resultMessage = toolLog.success 
        ? `Tool ${toolLog.toolName} completed successfully${toolLog.executionTimeMs ? ` in ${toolLog.executionTimeMs}ms` : ''}`
        : `Tool ${toolLog.toolName} failed: ${toolLog.error}`;
      
      logs.push({
        timestamp: toolLog.updatedAt.toISOString(),
        level: resultLevel,
        message: resultMessage,
        context: {
          toolCallId: toolLog.toolCallId,
          toolName: toolLog.toolName,
          success: toolLog.success,
          result: toolLog.result,
          error: toolLog.error,
          executionTimeMs: toolLog.executionTimeMs
        }
      });
    }

    // Add final call status if available
    if (latestCallWithTools.callStatus) {
      logs.push({
        timestamp: latestCallWithTools.updatedAt.toISOString(),
        level: 'info',
        message: `Call status: ${latestCallWithTools.callStatus}`,
        context: {
          callId: latestCallWithTools.vapiCallId,
          status: latestCallWithTools.callStatus,
          detectedIntent: latestCallWithTools.detectedIntent,
          appointmentType: latestCallWithTools.lastAppointmentTypeName
        }
      });
    }

    const response: DetailedCallDebugData = {
      callId: latestCallWithTools.vapiCallId,
      logs: logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
      callLog: {
        vapiCallId: latestCallWithTools.vapiCallId,
        practiceId: latestCallWithTools.practiceId,
        callStatus: latestCallWithTools.callStatus,
        detectedIntent: latestCallWithTools.detectedIntent,
        lastAppointmentTypeId: latestCallWithTools.lastAppointmentTypeId,
        lastAppointmentTypeName: latestCallWithTools.lastAppointmentTypeName,
        lastAppointmentDuration: latestCallWithTools.lastAppointmentDuration,
        callTimestampStart: latestCallWithTools.callTimestampStart,
        createdAt: latestCallWithTools.createdAt,
        updatedAt: latestCallWithTools.updatedAt,
      },
      toolLogs: latestCallWithTools.toolLogs.map(toolLog => ({
        toolCallId: toolLog.toolCallId,
        toolName: toolLog.toolName,
        arguments: toolLog.arguments,
        result: toolLog.result,
        error: toolLog.error,
        success: toolLog.success,
        executionTimeMs: toolLog.executionTimeMs,
        createdAt: toolLog.createdAt,
        updatedAt: toolLog.updatedAt,
      }))
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Error fetching latest call logs from database:", error);
    return NextResponse.json({ error: 'Failed to retrieve logs from database' }, { status: 500 });
  }
}

/**
 * DELETE endpoint to clear logs from the database if desired
 * Useful for testing or manual cleanup
 */
export async function DELETE() {
  try {
    // Delete all tool logs and call logs (in correct order due to foreign key constraints)
    await prisma.toolLog.deleteMany({});
    await prisma.callLog.deleteMany({});
    
    return NextResponse.json({ message: 'Database logs cleared' }, { status: 200 });
  } catch (error) {
    console.error("Error clearing database logs:", error);
    return NextResponse.json({ error: 'Failed to clear database logs' }, { status: 500 });
  }
} 