import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export default async function HomePage() {
  const { userId } = await auth();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Laine AI Voice Assistant
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Barebones testbed for VAPI & NexHealth integration
        </p>
        
        {userId ? (
          <div className="space-y-4">
            <p className="text-gray-700">Welcome back! Ready to configure your practice?</p>
            <Link
              href="/practice-config"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
            >
              Go to Practice Configuration
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-700">Get started by signing up or signing in to configure your practice.</p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/sign-up"
                className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
              >
                Sign Up
              </Link>
              <Link
                href="/sign-in"
                className="border border-gray-300 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-50 transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">Phase 1 Features</h3>
          <ul className="space-y-2 text-gray-600">
            <li>✅ Clerk Authentication</li>
            <li>✅ Practice Configuration</li>
            <li>✅ NexHealth Integration</li>
            <li>✅ Data Synchronization</li>
          </ul>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">Coming Soon</h3>
          <ul className="space-y-2 text-gray-600">
            <li>🔄 VAPI Integration</li>
            <li>🔄 Voice Assistant Setup</li>
            <li>🔄 Appointment Booking</li>
            <li>🔄 Call Management</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
