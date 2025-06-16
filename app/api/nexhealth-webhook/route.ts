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
      console.error("Missing webhook signature - potential unauthorized request");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    
    // Verify signature with enhanced security logging
    const expectedSignature = crypto
      .createHmac("sha256", globalWebhookConfig.secretKey)
      .update(rawBody)
      .digest("hex");
    
    // Use timing-safe comparison to prevent timing attacks
    const signatureMatches = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'), 
      Buffer.from(expectedSignature, 'hex')
    );
    
    if (!signatureMatches) {
      console.error("Signature verification failed");
      // Log truncated signatures for debugging without exposing full secrets
      console.error("Expected signature (first 8 chars):", expectedSignature.substring(0, 8));
      console.error("Received signature (first 8 chars):", signature.substring(0, 8));
      console.error("Request body hash (for debugging):", crypto.createHash('sha256').update(rawBody).digest('hex').substring(0, 16));
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    
    console.log("✅ Signature verification successful");
    
    // Parse and validate JSON
    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch (parseError) {
      console.error("JSON parsing failed:", parseError);
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    
    console.log("Webhook event received:", {
      resource_type: event.resource_type,
      event_name: event.event_name,
      subdomain: event.subdomain,
      institution_id: event.institution_id,
      timestamp: new Date().toISOString()
    });
    
    const { resource_type, event_name, subdomain, institution_id, data } = event;

    // Validate required event fields
    if (!resource_type || !event_name || !subdomain) {
      console.error("Missing required event fields:", { resource_type, event_name, subdomain });
      return NextResponse.json({ error: "Invalid event structure" }, { status: 400 });
    }

    // Find the practice associated with this subdomain/institution_id
    const practice = await prisma.practice.findFirst({
      where: { nexhealthSubdomain: subdomain },
    });

    if (!practice) {
      console.warn(`NexHealth Webhook: Received event for unknown subdomain/institution: ${subdomain}/${institution_id}`);
      // Still return 200 to NexHealth to acknowledge receipt and prevent retries for unknown practices.
      return NextResponse.json({ message: "Event received but practice not found" }, { status: 200 });
    }

    console.log(`Processing event for practice: ${practice.id} (${practice.name || 'Unnamed'})`);

    // --- Handle specific events with enhanced logging ---
    
    if (resource_type === "Patient") {
      if (event_name === "patient_created") {
        console.log(`✅ Practice ${practice.id} - Patient created in NexHealth. Patient ID: ${data?.patients?.[0]?.id}`);
        // TODO: Upsert patient data into local Patient table
      } else if (event_name === "patient_updated") {
        console.log(`✅ Practice ${practice.id} - Patient updated in NexHealth. Patient ID: ${data?.patients?.[0]?.id}`);
        // TODO: Update local patient data
      } else {
        console.log(`ℹ️ Practice ${practice.id} - Unhandled Patient event: ${event_name}`);
      }
    } else if (resource_type === "Appointment") {
      if (event_name === "appointment_created") {
        console.log(`✅ Practice ${practice.id} - Appointment created in EHR. Appointment ID: ${data?.appointment?.id}`);
        // TODO: Sync new appointment to local database
      } else if (event_name === "appointment_updated") {
        console.log(`✅ Practice ${practice.id} - Appointment updated in EHR. Appointment ID: ${data?.appointment?.id}`);
        // TODO: Update local appointment data
      } else if (event_name === "appointment_insertion.complete") {
        console.log(`🎉 Practice ${practice.id} - Appointment insertion complete (Laine booking succeeded). Appointment ID: ${data?.appointment?.id}`);
        // TODO: Mark appointment as confirmed in local DB
      } else if (event_name === "appointment_insertion.failed") {
        console.error(`❌ Practice ${practice.id} - Appointment insertion failed (Laine booking failed). Error: ${data?.error}`);
        // TODO: Handle booking failure, notify practice or retry
      } else {
        console.log(`ℹ️ Practice ${practice.id} - Unhandled Appointment event: ${event_name}`);
      }
    } else if (resource_type === "SyncStatus") {
      if (event_name === "sync_status_read_change") {
        console.log(`📊 Practice ${practice.id} - EHR read functionality status change. Status: ${data?.read_status}`);
        // TODO: Update system monitoring, resume read operations if needed
      } else if (event_name === "sync_status_write_change") {
        console.log(`📊 Practice ${practice.id} - EHR write functionality status change. Status: ${data?.write_status}`);
        // TODO: Update system monitoring, resume write operations if needed
      } else {
        console.log(`ℹ️ Practice ${practice.id} - Unhandled SyncStatus event: ${event_name}`);
      }
    } else {
      console.log(`ℹ️ Practice ${practice.id} - Received unhandled event: ${resource_type}.${event_name}`);
    }

    // Update webhook last sync timestamp
    await prisma.practice.update({
      where: { id: practice.id },
      data: { 
        webhookLastSyncAt: new Date(),
        webhookLastSuccessfulSyncAt: new Date(),
        webhookSyncErrorMsg: null
      }
    });

    return NextResponse.json({ success: true, message: "Event processed successfully" });
    
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 