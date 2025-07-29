/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Practice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PatientWebStatus" AS ENUM ('NEW', 'RETURNING', 'BOTH');

-- AlterTable
ALTER TABLE "AppointmentType" ADD COLUMN     "webPatientStatus" "PatientWebStatus" NOT NULL DEFAULT 'BOTH';

-- AlterTable
ALTER TABLE "Practice" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "WebBooking" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "appointmentTypeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "patientFirstName" TEXT NOT NULL,
    "patientLastName" TEXT NOT NULL,
    "patientDob" TEXT,
    "patientEmail" TEXT NOT NULL,
    "patientPhone" TEXT NOT NULL,
    "patientStatus" TEXT NOT NULL,
    "selectedSlotTime" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "nexhealthBookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebBooking_nexhealthBookingId_key" ON "WebBooking"("nexhealthBookingId");

-- CreateIndex
CREATE INDEX "WebBooking_practiceId_idx" ON "WebBooking"("practiceId");

-- CreateIndex
CREATE INDEX "WebBooking_appointmentTypeId_idx" ON "WebBooking"("appointmentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Practice_slug_key" ON "Practice"("slug");

-- AddForeignKey
ALTER TABLE "WebBooking" ADD CONSTRAINT "WebBooking_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebBooking" ADD CONSTRAINT "WebBooking_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
