import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ toolCallId: string }> }
) {
  try {
    const { toolCallId } = await params;

    if (!toolCallId) {
      return NextResponse.json(
        { error: 'toolCallId parameter is required' },
        { status: 400 }
      );
    }

    // Query the database for the ToolLog entry
    const toolLog = await prisma.toolLog.findFirst({
      where: { toolCallId: toolCallId },
      select: {
        id: true,
        toolCallId: true,
        toolName: true,
        arguments: true,
        result: true,
        success: true,
        error: true,
        executionTimeMs: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Handle case where no log is found
    if (!toolLog) {
      return NextResponse.json(
        { error: 'Tool log not found' },
        { status: 404 }
      );
    }

    // Parse the result if it exists and is a valid JSON string
    let parsedResult = null;
    if (toolLog.result) {
      try {
        parsedResult = JSON.parse(toolLog.result);
      } catch (parseError) {
        console.error('Failed to parse tool result JSON:', parseError);
        // Return the raw result string if parsing fails
        parsedResult = toolLog.result;
      }
    }

    // Parse the arguments if they exist
    let parsedArguments = null;
    if (toolLog.arguments) {
      try {
        parsedArguments = JSON.parse(toolLog.arguments);
      } catch (parseError) {
        console.error('Failed to parse tool arguments JSON:', parseError);
        parsedArguments = toolLog.arguments;
      }
    }

    // Return the tool log with parsed JSON fields
    return NextResponse.json({
      id: toolLog.id,
      toolCallId: toolLog.toolCallId,
      toolName: toolLog.toolName,
      arguments: parsedArguments,
      result: parsedResult,
      success: toolLog.success,
      error: toolLog.error,
      executionTimeMs: toolLog.executionTimeMs,
      createdAt: toolLog.createdAt,
      updatedAt: toolLog.updatedAt,
      // Add a flag to indicate if the result is ready
      hasResult: !!toolLog.result
    });

  } catch (error) {
    console.error('Error fetching tool log:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
