import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createVapiAssistant } from "@/lib/vapi";
import { getAllTools } from "@/lib/tools";
import { LainePracticeClient } from "./laine-practice-client";

async function createPracticeAssistant() {
  "use server";
  
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Get the practice
  const practice = await prisma.practice.findUnique({
    where: { clerkUserId: userId },
    include: { assistantConfig: true }
  });

  if (!practice) {
    throw new Error("Practice not found");
  }

  if (practice.assistantConfig?.vapiAssistantId) {
    throw new Error("Assistant already exists for this practice");
  }

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  // Build tools for the assistant
  const tools = getAllTools(appBaseUrl);
  
  // Create default assistant configuration
  const assistantConfig = {
    name: `${practice.name || 'Practice'} - Laine`,
    model: {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system" as const,
          content: "You are a helpful AI assistant for a dental practice. Your primary goal is to assist patients. Be polite and efficient."
        }
      ],
      tools
    },
    voice: {
      provider: "vapi" as const,
      voiceId: "Elliot"
    },
    firstMessage: "Hello! This is Laine from your dental office. How can I help you today?",
    // General assistant webhooks (status updates, call reports, transcripts)
    serverUrl: `${appBaseUrl}/api/vapi/webhook`,
    serverMessages: ["end-of-call-report", "status-update", "transcript"],
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600, // 10 minutes
    backgroundSound: "office" as const,
    backchannelingEnabled: true,
    backgroundDenoisingEnabled: true,
    modelOutputInMessagesEnabled: true
  };

  try {
    console.log("Creating VAPI assistant for practice:", practice.id);
    const vapiAssistant = await createVapiAssistant(assistantConfig);
    
    // Create or update the assistant config in our database
    await prisma.practiceAssistantConfig.upsert({
      where: { practiceId: practice.id },
      create: {
        practiceId: practice.id,
        vapiAssistantId: vapiAssistant.id,
        voiceProvider: "vapi",
        voiceId: "Elliot",
        systemPrompt: "You are a helpful AI assistant for a dental practice. Your primary goal is to assist patients. Be polite and efficient.",
        firstMessage: "Hello! This is Laine from your dental office. How can I help you today?"
      },
      update: {
        vapiAssistantId: vapiAssistant.id,
        updatedAt: new Date()
      }
    });

    console.log(`Successfully created VAPI assistant ${vapiAssistant.id} for practice ${practice.id}`);
  } catch (error) {
    console.error("Error creating VAPI assistant:", error);
    throw new Error(`Failed to create assistant: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  revalidatePath("/laine");
}

export default async function LainePage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/sign-in");
  }

  // Get the practice with assistant configuration
  const practice = await prisma.practice.findUnique({
    where: { clerkUserId: userId },
    include: { assistantConfig: true }
  });

  if (!practice) {
    redirect("/practice-config");
  }

  const hasAssistant = practice.assistantConfig?.vapiAssistantId;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Laine Assistant Configuration</h1>
        <LainePracticeClient 
          practice={practice} 
          hasAssistant={!!hasAssistant}
          createPracticeAssistant={createPracticeAssistant}
        />
      </div>
    </div>
  );
} 