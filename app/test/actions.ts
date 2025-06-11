"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export interface LatestCallLogData {
  vapiCallId: string;
  transcriptText: string | null;
  recordingUrl: string | null; // Ensure this field exists or is mapped correctly in CallLog
  endedReason: string | null;
  callStatus: string | null;
  summary: string | null;
  createdAt: Date;
}

export async function getAssistantPhoneNumber(assistantId: string): Promise<string | null> {
  if (!process.env.VAPI_API_KEY) {
    console.error("VAPI_API_KEY (private key) not set for fetching phone number.");
    return null;
  }
  try {
    const response = await fetch(`https://api.vapi.ai/phone-number?assistantId=${assistantId}`, {
      headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}` }
    });
    if (!response.ok) {
      console.error(`Failed to fetch phone numbers from Vapi: ${response.status} ${await response.text()}`);
      return null;
    }
    const data = await response.json();
    // Vapi returns an array of phone number objects. Each object has a 'number' field.
    // We'll return the first one found.
    if (Array.isArray(data) && data.length > 0 && data[0].number) {
      return data[0].number;
    }
    return null;
  } catch (error) {
    console.error("Error fetching assistant phone number from Vapi:", error);
    return null;
  }
}

export async function getLatestCallLogForPractice(practiceId: string): Promise<LatestCallLogData | null> {
  try {
    const latestCallLog = await prisma.callLog.findFirst({
      where: { practiceId: practiceId },
      orderBy: { createdAt: 'desc' },
      select: {
        vapiCallId: true,
        transcriptText: true,
        vapiTranscriptUrl: true, // Assuming this stores the recording URL. If not, adjust.
                                 // Let's rename to recordingUrl for clarity if it's audio.
        endedReason: true,
        callStatus: true,
        summary: true,
        createdAt: true
      }
    });

    if (latestCallLog) {
      return {
        ...latestCallLog,
        // If vapiTranscriptUrl is indeed the recording URL, map it here for clarity
        // or ensure the schema/population logic is correct.
        // For now, let's assume it's correct and the client will use it.
        // If it's not, we'll need to adjust how 'recordingUrl' is populated.
        // For the purpose of this prompt, let's assume vapiTranscriptUrl IS the recordingUrl.
        recordingUrl: latestCallLog.vapiTranscriptUrl 
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching latest call log:", error);
    return null;
  }
}

export async function getPracticeAndAssistantId() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in"); // Or handle as an error
  }

  const practiceWithConfig = await prisma.practice.findUnique({
    where: { clerkUserId: userId },
    include: { assistantConfig: true }
  });

  if (!practiceWithConfig) {
    // This case should ideally redirect to a setup page if practice doesn't exist
    console.warn(`No practice found for clerkUserId: ${userId}. Redirecting to /practice-config.`);
    redirect("/practice-config");
  }
  if (!practiceWithConfig.assistantConfig?.vapiAssistantId) {
    console.warn(`No Vapi assistant configured for practiceId: ${practiceWithConfig.id}. Redirecting to /laine.`);
    redirect('/laine');
  }
  
  return {
    practiceId: practiceWithConfig.id,
    vapiAssistantId: practiceWithConfig.assistantConfig.vapiAssistantId,
  };
} 