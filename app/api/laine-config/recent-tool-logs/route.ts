import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the practice
    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId },
      select: { id: true }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Find the most recent vapiCallId that has tool logs for this practice
    const latestCallWithLogs = await prisma.toolLog.findFirst({
      where: { practiceId: practice.id },
      orderBy: { createdAt: 'desc' },
      select: { vapiCallId: true }
    });

    if (!latestCallWithLogs?.vapiCallId) {
      return NextResponse.json({ logs: [] });
    }

    // Fetch all logs for the most recent call with logs
    const recentLogs = await prisma.toolLog.findMany({
      where: {
        practiceId: practice.id,
        vapiCallId: latestCallWithLogs.vapiCallId
      },
      orderBy: { createdAt: 'asc' }, // Show tools in execution order for that call
      select: {
        id: true,
        toolName: true,
        arguments: true,
        result: true,
        success: true,
        error: true,
        executionTimeMs: true,
        createdAt: true,
        toolCallId: true
      }
    });

    // Transform the data to parse JSON strings and make it more client-friendly
    const transformedLogs = recentLogs.map(log => {
      let parsedArguments = null;
      let parsedResult = null;

      try {
        parsedArguments = log.arguments ? JSON.parse(log.arguments) : null;
      } catch (error) {
        console.warn(`Failed to parse arguments for tool log ${log.id}:`, error);
        parsedArguments = log.arguments;
      }

      try {
        parsedResult = log.result ? JSON.parse(log.result) : null;
      } catch (error) {
        console.warn(`Failed to parse result for tool log ${log.id}:`, error);
        parsedResult = log.result;
      }

      return {
        id: log.id,
        toolName: log.toolName,
        arguments: parsedArguments,
        result: parsedResult,
        success: log.success,
        error: log.error,
        executionTimeMs: log.executionTimeMs,
        createdAt: log.createdAt,
        toolCallId: log.toolCallId
      };
    });

    return NextResponse.json({ 
      logs: transformedLogs,
      callId: latestCallWithLogs.vapiCallId,
      totalLogs: transformedLogs.length
    });
  } catch (error) {
    console.error("Error fetching recent tool logs:", error);
    return NextResponse.json(
      { error: `Failed to fetch tool logs: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
} 