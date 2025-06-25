import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { updateVapiAssistant } from "@/lib/vapi";
import { getAllTools } from "@/lib/tools";
import type { VapiUpdatePayload } from "@/types/vapi";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { voiceProvider, voiceId, systemPrompt, firstMessage } = body;

    if (!voiceProvider || !voiceId || !systemPrompt || !firstMessage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get the practice with assistant config
    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId },
      include: { assistantConfig: true }
    });

    if (!practice || !practice.assistantConfig?.vapiAssistantId) {
      return NextResponse.json({ error: "Practice or assistant not found" }, { status: 404 });
    }

    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const tools = getAllTools(appBaseUrl);
    
    // Update VAPI assistant with new configuration
    const updateConfig: VapiUpdatePayload = {
      model: {
        provider: "openai" as const,
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system" as const,
            content: systemPrompt
          }
        ],
        tools
      },
      voice: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: voiceProvider as any,
        voiceId: voiceId
      },
      firstMessage: firstMessage
    };

    console.log("Updating VAPI assistant:", practice.assistantConfig.vapiAssistantId);
    await updateVapiAssistant(practice.assistantConfig.vapiAssistantId, updateConfig);
    
    // Update our database
    await prisma.practiceAssistantConfig.update({
      where: { practiceId: practice.id },
      data: {
        voiceProvider,
        voiceId,
        systemPrompt,
        firstMessage,
        updatedAt: new Date()
      }
    });

    console.log(`Successfully updated VAPI assistant for practice ${practice.id}`);
    
    return NextResponse.json({ success: true, message: "Assistant configuration updated successfully" });
  } catch (error) {
    console.error("Error updating VAPI assistant:", error);
    return NextResponse.json(
      { error: `Failed to update assistant: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}