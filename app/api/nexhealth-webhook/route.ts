import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

async function getRawBody(req: NextRequest): Promise<Buffer> {
  const reader = req.body?.getReader();
  if (!reader) return Buffer.from('');
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  console.log("=== NexHealth Webhook Handler ===");
  
  try {
    const rawBody = await getRawBody(req);
    console.log("Raw body length:", rawBody.length);
    
    if (rawBody.length === 0) {
      console.error("Empty request body received");
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }
    
    const signature = req.headers.get("x-nexhealth-signature");
    console.log("Signature present:", !!signature);
    
    // Enhanced signature verification with better error messages
    const globalWebhookConfig = await prisma.globalNexhealthWebhookEndpoint.findUnique({
      where: { id: "singleton" }
    });
    
    if (!globalWebhookConfig?.secretKey) {
      console.error("CRITICAL: Webhook secret not found in database");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }
    
    if (!signature) {
      console.error("Missing webhook signature");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", globalWebhookConfig.secretKey)
      .update(rawBody)
      .digest("hex");
    
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      console.error("Signature verification failed");
      console.error("Expected:", expectedSignature);
      console.error("Received:", signature);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    
    // Parse and validate JSON
    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch (parseError) {
      console.error("JSON parsing failed:", parseError);
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    
    console.log("Webhook event received:", {
      resource_type: event.resource_type,
      event_name: event.event_name,
      subdomain: event.subdomain,
      institution_id: event.institution_id
    });
    
    const { resource_type, event_name, subdomain, institution_id, data } = event;

    // Find the practice associated with this subdomain/institution_id
    // Note: A practice might have a subdomain but events might come with institution_id.
    // Ensure your Practice model can be looked up by either, or that you store institution_id.
    // For now, assuming subdomain is the primary link from webhook to your Practice model.
    const practice = await prisma.practice.findFirst({
      where: { nexhealthSubdomain: subdomain }, // Or use institution_id if that's more reliable
    });

    if (!practice) {
      console.warn(`NexHealth Webhook: Received event for unknown subdomain/institution: ${subdomain}/${institution_id}`);
      // Still return 200 to NexHealth to acknowledge receipt and prevent retries for unknown practices.
      return NextResponse.json({ message: "Received, but practice not found." }, { status: 200 });
    }

    // --- Handle specific events ---
    // For Phase 2, we'll log events. Actual data processing (e.g., updating local DB) will be in later phases.
    
    if (resource_type === "Patient") {
      if (event_name === "patient_created") {
        console.log(`NexHealth Webhook: Practice ${practice.id} - Patient created in NexHealth. Patient ID: ${data?.patients?.[0]?.id}`);
        // TODO: Upsert patient data into local Patient table
      } else if (event_name === "patient_updated") {
        console.log(`NexHealth Webhook: Practice ${practice.id} - Patient updated in NexHealth. Patient ID: ${data?.patients?.[0]?.id}`);
        // TODO: Update local patient data
      }
    } else if (resource_type === "Appointment") {
      if (event_name === "appointment_created") {
        console.log(`NexHealth Webhook: Practice ${practice.id} - Appointment created in EHR. Appointment ID: ${data?.appointment?.id}`);
        // TODO: Sync new appointment to local database
      } else if (event_name === "appointment_updated") {
        console.log(`NexHealth Webhook: Practice ${practice.id} - Appointment updated in EHR. Appointment ID: ${data?.appointment?.id}`);
        // TODO: Update local appointment data
      } else if (event_name === "appointment_insertion.complete") {
        console.log(`NexHealth Webhook: Practice ${practice.id} - Appointment insertion complete (Laine booking succeeded). Appointment ID: ${data?.appointment?.id}`);
        // TODO: Mark appointment as confirmed in local DB
      } else if (event_name === "appointment_insertion.failed") {
        console.log(`NexHealth Webhook: Practice ${practice.id} - Appointment insertion failed (Laine booking failed). Error: ${data?.error}`);
        // TODO: Handle booking failure, notify practice or retry
      }
    } else if (resource_type === "SyncStatus") {
      if (event_name === "sync_status_read_change") {
        console.log(`NexHealth Webhook: Practice ${practice.id} - EHR read functionality came back online. Status: ${data?.read_status}`);
        // TODO: Update system monitoring, resume read operations if needed
      } else if (event_name === "sync_status_write_change") {
        console.log(`NexHealth Webhook: Practice ${practice.id} - EHR write functionality came back online. Status: ${data?.write_status}`);
        // TODO: Update system monitoring, resume write operations if needed
      }
    } else {
      console.log(`NexHealth Webhook: Practice ${practice.id} - Received unhandled event: ${resource_type}.${event_name}`);
    }

    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 