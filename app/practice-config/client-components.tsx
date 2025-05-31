"use client";

import { toast } from "sonner";
import { useFormStatus } from "react-dom";

export function SaveConfigButton() {
  const { pending } = useFormStatus();
  
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Saving..." : "Save Configuration"}
    </button>
  );
}

export function SyncDataButton() {
  const { pending } = useFormStatus();
  
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Syncing..." : "Sync NexHealth Data"}
    </button>
  );
}

export function ConfigForm({ children, action }: { children: React.ReactNode; action: (formData: FormData) => Promise<void> }) {
  const handleSubmit = async (formData: FormData) => {
    try {
      await action(formData);
      toast.success("Configuration saved successfully!");
    } catch {
      toast.error("Failed to save configuration. Please try again.");
    }
  };

  return (
    <form action={handleSubmit} className="space-y-4">
      {children}
    </form>
  );
}

export function SyncForm({ children, action }: { children: React.ReactNode; action: () => Promise<void> }) {
  const handleSubmit = async () => {
    try {
      await action();
      toast.success("NexHealth data synced successfully!");
    } catch {
      toast.error("Failed to sync data. Please check your configuration and try again.");
    }
  };

  return (
    <form action={handleSubmit}>
      {children}
    </form>
  );
} 