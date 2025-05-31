import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createVapiAssistant, updateVapiAssistant } from "@/lib/vapi";
import { buildVapiTools } from "@/lib/tools";

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
  const tools = buildVapiTools(appBaseUrl);
  
  // Create default assistant configuration
  const assistantConfig = {
    name: `${practice.name ? practice.name.substring(0, 15) : 'Practice'} - Laine`,
    model: {
      provider: "openai" as const,
      model: "gpt-4.1-nano-2025-04-14",
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
      provider: "11labs" as const,
      voiceId: "burt"
    },
    firstMessage: "Hello! This is Laine from your dental office. How can I help you today?",
    serverUrl: `${appBaseUrl}/api/vapi/tool-handler`,
    serverMessages: ["tool-calls", "end-of-call-report", "status-update", "transcript"],
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
        voiceProvider: "11labs",
        voiceId: "burt",
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

async function updatePracticeAssistantConfig(formData: FormData) {
  "use server";
  
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const voiceProvider = formData.get("voiceProvider") as string;
  const voiceId = formData.get("voiceId") as string;
  const systemPrompt = formData.get("systemPrompt") as string;
  const firstMessage = formData.get("firstMessage") as string;

  // Get the practice with assistant config
  const practice = await prisma.practice.findUnique({
    where: { clerkUserId: userId },
    include: { assistantConfig: true }
  });

  if (!practice || !practice.assistantConfig?.vapiAssistantId) {
    throw new Error("Practice or assistant not found");
  }

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const tools = buildVapiTools(appBaseUrl);
  
  // Update VAPI assistant with new configuration
  const updateConfig = {
    model: {
      provider: "openai" as const,
      model: "gpt-4.1-nano-2025-04-14",
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

  try {
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
  } catch (error) {
    console.error("Error updating VAPI assistant:", error);
    throw new Error(`Failed to update assistant: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        <h1 className="text-3xl font-bold mb-6">Laine AI Assistant Configuration</h1>
        
        {!hasAssistant ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Create Your AI Assistant</h2>
            <p className="text-gray-600 mb-6">
              Create a personalized AI assistant for your practice. Laine will help patients with basic inquiries,
              patient lookups, and appointment scheduling.
            </p>
            
            <form action={createPracticeAssistant}>
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Create Laine Assistant
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-6">Configure Your AI Assistant</h2>
            
            <form action={updatePracticeAssistantConfig} className="space-y-6">
              <div>
                <label htmlFor="voiceProvider" className="block text-sm font-medium text-gray-700 mb-2">
                  Voice Provider
                </label>
                <select
                  id="voiceProvider"
                  name="voiceProvider"
                  defaultValue={practice.assistantConfig?.voiceProvider}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="11labs">ElevenLabs</option>
                  <option value="openai">OpenAI</option>
                  <option value="playht">PlayHT</option>
                </select>
              </div>

              <div>
                <label htmlFor="voiceId" className="block text-sm font-medium text-gray-700 mb-2">
                  Voice ID
                </label>
                <input
                  type="text"
                  id="voiceId"
                  name="voiceId"
                  defaultValue={practice.assistantConfig?.voiceId}
                  placeholder="e.g., burt, alloy"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Voice ID specific to the selected provider (e.g., &quot;burt&quot; for ElevenLabs, &quot;alloy&quot; for OpenAI)
                </p>
              </div>

              <div>
                <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700 mb-2">
                  System Prompt
                </label>
                <textarea
                  id="systemPrompt"
                  name="systemPrompt"
                  rows={4}
                  defaultValue={practice.assistantConfig?.systemPrompt}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Instructions that define how the AI should behave..."
                />
                <p className="text-sm text-gray-500 mt-1">
                  Define how Laine should behave and what it should know about your practice
                </p>
              </div>

              <div>
                <label htmlFor="firstMessage" className="block text-sm font-medium text-gray-700 mb-2">
                  First Message
                </label>
                <input
                  type="text"
                  id="firstMessage"
                  name="firstMessage"
                  defaultValue={practice.assistantConfig?.firstMessage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Hello! This is Laine from your dental office..."
                />
                <p className="text-sm text-gray-500 mt-1">
                  The first thing Laine says when answering a call
                </p>
              </div>

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  Assistant ID: {practice.assistantConfig?.vapiAssistantId}
                </div>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Update Configuration
                </button>
              </div>
            </form>

            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Available Tools</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Patient Search - Find patients by name and date of birth</li>
                <li>• More tools will be added in future updates</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 