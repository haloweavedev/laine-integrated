-- CreateTable
CREATE TABLE "Practice" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "name" TEXT,
    "nexhealthSubdomain" TEXT,
    "nexhealthLocationId" TEXT,
    "webhookLastSyncAt" TIMESTAMP(3),
    "webhookLastSuccessfulSyncAt" TIMESTAMP(3),
    "webhookSyncErrorMsg" TEXT,
    "address" TEXT,
    "acceptedInsurances" TEXT,
    "serviceCostEstimates" TEXT,
    "timezone" TEXT,
    "lunchBreakStart" TEXT,
    "lunchBreakEnd" TEXT,
    "minBookingBufferMinutes" INTEGER DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_providers" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_accepted_appointment_types" (
    "id" TEXT NOT NULL,
    "savedProviderId" TEXT NOT NULL,
    "appointmentTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_accepted_appointment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_operatory_assignments" (
    "id" TEXT NOT NULL,
    "savedProviderId" TEXT NOT NULL,
    "savedOperatoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_operatory_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_operatories" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "nexhealthOperatoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_operatories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAssistantConfig" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "vapiAssistantId" TEXT,
    "voiceProvider" TEXT NOT NULL DEFAULT '11labs',
    "voiceId" TEXT NOT NULL DEFAULT 'burt',
    "systemPrompt" TEXT NOT NULL DEFAULT 'You are a helpful AI assistant for a dental practice. Your primary goal is to assist patients. Be polite and efficient.',
    "firstMessage" TEXT NOT NULL DEFAULT 'Hello! This is Laine from your dental office. How can I help you today?',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeAssistantConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalNexhealthWebhookEndpoint" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "nexhealthEndpointId" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalNexhealthWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NexhealthWebhookSubscription" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "nexhealthWebhookEndpointId" TEXT NOT NULL,
    "nexhealthSubscriptionId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexhealthWebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "vapiCallId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "callTimestampStart" TIMESTAMP(3),
    "callStatus" TEXT,
    "transcriptText" TEXT,
    "summary" TEXT,
    "vapiTranscriptUrl" TEXT,
    "detectedIntent" TEXT,
    "nexhealthPatientId" TEXT,
    "bookedAppointmentNexhealthId" TEXT,
    "conversationState" JSONB,
    "patientStatus" TEXT,
    "originalPatientRequestForType" TEXT,
    "assistantId" TEXT,
    "endedReason" TEXT,
    "callDurationSeconds" INTEGER,
    "cost" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolLog" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "vapiCallId" TEXT,
    "toolName" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "arguments" TEXT,
    "result" TEXT,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "executionTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentType" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "nexhealthAppointmentTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "bookableOnline" BOOLEAN,
    "spokenName" TEXT,
    "check_immediate_next_available" BOOLEAN NOT NULL DEFAULT false,
    "keywords" TEXT,
    "parentType" TEXT,
    "parentId" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "nexhealthProviderId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NexhealthTokenCache" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexhealthTokenCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Practice_clerkUserId_key" ON "Practice"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_providers_practiceId_providerId_key" ON "saved_providers"("practiceId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_accepted_appointment_types_savedProviderId_appoint_key" ON "provider_accepted_appointment_types"("savedProviderId", "appointmentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_operatory_assignments_savedProviderId_savedOperato_key" ON "provider_operatory_assignments"("savedProviderId", "savedOperatoryId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_operatories_practiceId_nexhealthOperatoryId_key" ON "saved_operatories"("practiceId", "nexhealthOperatoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAssistantConfig_practiceId_key" ON "PracticeAssistantConfig"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAssistantConfig_vapiAssistantId_key" ON "PracticeAssistantConfig"("vapiAssistantId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalNexhealthWebhookEndpoint_nexhealthEndpointId_key" ON "GlobalNexhealthWebhookEndpoint"("nexhealthEndpointId");

-- CreateIndex
CREATE UNIQUE INDEX "NexhealthWebhookSubscription_nexhealthSubscriptionId_key" ON "NexhealthWebhookSubscription"("nexhealthSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "NexhealthWebhookSubscription_practiceId_resourceType_eventN_key" ON "NexhealthWebhookSubscription"("practiceId", "resourceType", "eventName");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_vapiCallId_key" ON "CallLog"("vapiCallId");

-- CreateIndex
CREATE INDEX "ToolLog_practiceId_toolName_idx" ON "ToolLog"("practiceId", "toolName");

-- CreateIndex
CREATE INDEX "ToolLog_vapiCallId_idx" ON "ToolLog"("vapiCallId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentType_practiceId_nexhealthAppointmentTypeId_key" ON "AppointmentType"("practiceId", "nexhealthAppointmentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_practiceId_nexhealthProviderId_key" ON "Provider"("practiceId", "nexhealthProviderId");

-- AddForeignKey
ALTER TABLE "saved_providers" ADD CONSTRAINT "saved_providers_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_providers" ADD CONSTRAINT "saved_providers_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_accepted_appointment_types" ADD CONSTRAINT "provider_accepted_appointment_types_savedProviderId_fkey" FOREIGN KEY ("savedProviderId") REFERENCES "saved_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_accepted_appointment_types" ADD CONSTRAINT "provider_accepted_appointment_types_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_operatory_assignments" ADD CONSTRAINT "provider_operatory_assignments_savedProviderId_fkey" FOREIGN KEY ("savedProviderId") REFERENCES "saved_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_operatory_assignments" ADD CONSTRAINT "provider_operatory_assignments_savedOperatoryId_fkey" FOREIGN KEY ("savedOperatoryId") REFERENCES "saved_operatories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_operatories" ADD CONSTRAINT "saved_operatories_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAssistantConfig" ADD CONSTRAINT "PracticeAssistantConfig_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NexhealthWebhookSubscription" ADD CONSTRAINT "NexhealthWebhookSubscription_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolLog" ADD CONSTRAINT "ToolLog_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolLog" ADD CONSTRAINT "ToolLog_vapiCallId_fkey" FOREIGN KEY ("vapiCallId") REFERENCES "CallLog"("vapiCallId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
