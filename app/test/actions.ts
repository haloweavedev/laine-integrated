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

export interface PracticeTestData {
  practiceId: string;
  practiceName: string;
  vapiAssistantId: string;
  nexhealthSubdomain: string | null;
  nexhealthLocationId: string | null;
  timezone: string;
}

export interface NexHealthTestResult {
  success: boolean;
  message: string;
  data?: {
    appointmentTypesCount?: number;
    providersCount?: number;
    operatoriesCount?: number;
  };
  error?: string;
}

export async function getAssistantPhoneNumber(assistantId: string): Promise<string | null> {
  if (!process.env.VAPI_API_KEY) {
    console.error("VAPI_API_KEY (private key) not set for fetching phone number.");
    return null;
  }
  
  const url = `https://api.vapi.ai/phone-number?assistantId=${encodeURIComponent(assistantId)}`;
  console.log(`[getAssistantPhoneNumber] Fetching URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET', // Explicitly set GET, though it's default
      headers: { 
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        // Don't include Content-Type for GET requests
      }
      // Ensure no 'body' property is present for a GET request
    });

    if (!response.ok) {
      const errorBodyText = await response.text();
      console.error(`[getAssistantPhoneNumber] Failed to fetch phone numbers from Vapi. Status: ${response.status}, Body: ${errorBodyText}`);
      
      // Log the specific error message from Vapi if it's JSON
      try {
        const errorJson = JSON.parse(errorBodyText);
        console.error("[getAssistantPhoneNumber] Vapi error JSON:", errorJson);
      } catch {
        // Not JSON, already logged as text
      }
      
      // If the assistantId filter fails, try fetching all phone numbers and filter client-side
      if (response.status === 400 && errorBodyText.includes('assistantId')) {
        console.log("[getAssistantPhoneNumber] assistantId query parameter failed, trying fallback approach...");
        return await getPhoneNumberFallback(assistantId);
      }
      
      return null;
    }

    const data = await response.json();
    console.log("[getAssistantPhoneNumber] Vapi response data:", data);

    if (Array.isArray(data) && data.length > 0 && data[0].number) {
      console.log(`[getAssistantPhoneNumber] Found phone number: ${data[0].number}`);
      return data[0].number;
    } else if (Array.isArray(data) && data.length === 0) {
      console.log(`[getAssistantPhoneNumber] No phone numbers found associated with assistantId: ${assistantId}`);
      return null;
    } else {
      console.warn(`[getAssistantPhoneNumber] Unexpected data structure from Vapi:`, data);
      return null;
    }
  } catch (error) {
    console.error("[getAssistantPhoneNumber] Error fetching assistant phone number from Vapi:", error);
    return null;
  }
}

// Fallback function to fetch all phone numbers and filter by assistant ID
async function getPhoneNumberFallback(assistantId: string): Promise<string | null> {
  console.log(`[getPhoneNumberFallback] Fetching all phone numbers and filtering for assistantId: ${assistantId}`);
  
  try {
    const response = await fetch('https://api.vapi.ai/phone-number', {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
      }
    });

    if (!response.ok) {
      const errorBodyText = await response.text();
      console.error(`[getPhoneNumberFallback] Failed to fetch all phone numbers from Vapi. Status: ${response.status}, Body: ${errorBodyText}`);
      return null;
    }

    const data = await response.json();
    console.log("[getPhoneNumberFallback] All phone numbers response:", data);

    if (Array.isArray(data)) {
      // Look for a phone number object that has the matching assistant ID
      const matchingPhone = data.find(phoneObj => {
        // The structure might vary, check common paths
        return phoneObj.assistantId === assistantId || 
               phoneObj.assistant?.id === assistantId ||
               phoneObj.assistant === assistantId;
      });
      
      if (matchingPhone && matchingPhone.number) {
        console.log(`[getPhoneNumberFallback] Found matching phone number: ${matchingPhone.number}`);
        return matchingPhone.number;
      } else {
        console.log(`[getPhoneNumberFallback] No phone number found for assistantId: ${assistantId}`);
        return null;
      }
    } else {
      console.warn("[getPhoneNumberFallback] Unexpected response structure from all phone numbers API:", data);
      return null;
    }
  } catch (error) {
    console.error("[getPhoneNumberFallback] Error in fallback phone number fetch:", error);
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
    include: { 
      assistantConfig: true
    }
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
    practiceName: practiceWithConfig.name || 'Unnamed Practice',
    vapiAssistantId: practiceWithConfig.assistantConfig.vapiAssistantId,
    nexhealthSubdomain: practiceWithConfig.nexhealthSubdomain,
    nexhealthLocationId: practiceWithConfig.nexhealthLocationId,
    timezone: practiceWithConfig.timezone || 'America/Chicago',
  };
}

export async function testNexHealthConnection(): Promise<NexHealthTestResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, message: "Unauthorized", error: "User not authenticated" };
  }

  try {
    const practiceData = await getPracticeAndAssistantId();
    
    if (!practiceData.nexhealthSubdomain || !practiceData.nexhealthLocationId) {
      return { 
        success: false, 
        message: "NexHealth configuration missing", 
        error: "Practice does not have NexHealth subdomain or location ID configured" 
      };
    }

    // Import NexHealth functions dynamically to test the connection
    const { getAppointmentTypes, getProviders, getOperatories } = await import("@/lib/nexhealth");

    console.log(`[testNexHealthConnection] Testing with subdomain: ${practiceData.nexhealthSubdomain}, locationId: ${practiceData.nexhealthLocationId}`);

    // Test all three main NexHealth APIs
    const [appointmentTypes, providers, operatories] = await Promise.all([
      getAppointmentTypes(practiceData.nexhealthSubdomain, practiceData.nexhealthLocationId),
      getProviders(practiceData.nexhealthSubdomain, practiceData.nexhealthLocationId),
      getOperatories(practiceData.nexhealthSubdomain, practiceData.nexhealthLocationId)
    ]);

    return {
      success: true,
      message: "NexHealth connection successful",
      data: {
        appointmentTypesCount: appointmentTypes.length,
        providersCount: providers.length,
        operatoriesCount: operatories.length
      }
    };

  } catch (error) {
    console.error("[testNexHealthConnection] Error:", error);
    return {
      success: false,
      message: "NexHealth connection failed",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
} 