import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPracticeAndAssistantId } from "../test/actions";
import { DemoClient } from "./demo-client";

export default async function DemoPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let vapiAssistantId: string;

  try {
    const assistantInfo = await getPracticeAndAssistantId();
    vapiAssistantId = assistantInfo.vapiAssistantId;
  } catch (error) {
    // Handle errors during data fetching (e.g., redirects from actions)
    // If an error is thrown and not a redirect, it will bubble up.
    // For redirects, they will be handled by Next.js automatically.
    if (error instanceof Error && (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    console.error("Error fetching data for /demo page:", error);
    // Render a fallback error state
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4 text-slate-800">Unable to Load Demo</h1>
          <p className="text-gray-600 mb-4">
            Could not load the necessary information to start the demo. 
            Please ensure your practice and Laine assistant are configured.
          </p>
          <p className="text-sm text-red-600">
            Error: {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <div className="mt-6 space-y-2">
            <a 
              href="/practice-config" 
              className="block w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Configure Practice
            </a>
            <a 
              href="/laine" 
              className="block w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              Setup Laine Assistant
            </a>
          </div>
        </div>
      </div>
    );
  }
  
  return <DemoClient vapiAssistantId={vapiAssistantId} />;
}
