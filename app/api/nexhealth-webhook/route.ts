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
  console.log("NexHealth Webhook: Received request");
  const rawBody = await getRawBody(req);
  const signature = req.headers.get("x-nexhealth-signature");

  // Fetch the global webhook secret from DB (or env, but DB allows dynamic updates if secret changes)
  const globalWebhookConfig = await prisma.globalNexhealthWebhookEndpoint.findUnique({
    where: { id: "singleton" }, // Assuming you use a fixed ID for the global config
  });

  if (!globalWebhookConfig || !globalWebhookConfig.secretKey) {
    console.error("NexHealth Webhook: Secret key not configured in the database.");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }
  const NEXHEALTH_WEBHOOK_SECRET = globalWebhookConfig.secretKey;

  if (!signature) {
    console.warn("NexHealth Webhook: Signature missing");
    return NextResponse.json({ error: "Signature missing" }, { status: 400 });
  }

  const expectedSignature = crypto
    .createHmac("sha256", NEXHEALTH_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    console.error("NexHealth Webhook: Invalid signature.");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody.toString());
  console.log("NexHealth Webhook: Signature VERIFIED. Event:", JSON.stringify(event, null, 2));

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
  // For Phase 2, we'll just log. Actual data processing (e.g., updating local DB) will be in later phases.
  if (resource_type === "Appointment" && event_name === "appointment_insertion.complete") {
    console.log(`NexHealth Webhook: Practice ${practice.id} - Appointment insertion complete for appt ID ${data?.appointment?.id} in NexHealth.`);
    // TODO: In future, upsert this appointment data into a local Appointment table if needed for Laine's state.
  } else if (resource_type === "Patient" && event_name === "patient_created") {
    console.log(`NexHealth Webhook: Practice ${practice.id} - Patient created in NexHealth. Patient ID: ${data?.patients?.[0]?.id}`);
    // TODO: Upsert patient data.
  } else {
    console.log(`NexHealth Webhook: Practice ${practice.id} - Received unhandled event: ${resource_type} - ${event_name}`);
  }

  return NextResponse.json({ message: "Webhook received successfully" }, { status: 200 });
} 