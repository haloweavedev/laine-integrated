import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Heading,
  Button,
  Hr,
  Section,
} from '@react-email/components';

interface AppointmentConfirmationProps {
  patientName: string;
  appointmentType: string;
  appointmentDate: string;
  practiceName: string;
  practiceAddress?: string;
}

export default function AppointmentConfirmation({
  patientName,
  appointmentType,
  appointmentDate,
  practiceName,
  practiceAddress,
}: AppointmentConfirmationProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>Your Appointment is Confirmed!</Heading>
          </Section>

          <Section style={content}>
            <Text style={greeting}>
              Hello {patientName},
            </Text>

            <Text style={paragraph}>
              We're excited to confirm your upcoming appointment. Here are the details:
            </Text>

            <Section style={appointmentDetails}>
              <Text style={detailRow}>
                <strong>Appointment Type:</strong> {appointmentType}
              </Text>
              <Text style={detailRow}>
                <strong>Date & Time:</strong> {appointmentDate}
              </Text>
              <Text style={detailRow}>
                <strong>Practice:</strong> {practiceName}
              </Text>
              {practiceAddress && (
                <Text style={detailRow}>
                  <strong>Address:</strong> {practiceAddress}
                </Text>
              )}
            </Section>

            <Text style={paragraph}>
              Please arrive 15 minutes early for your appointment. If you need to reschedule or cancel, 
              please contact our office as soon as possible.
            </Text>

            <Text style={paragraph}>
              We look forward to seeing you!
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              {practiceName}
              {practiceAddress && (
                <>
                  <br />
                  {practiceAddress}
                </>
              )}
            </Text>
            <Text style={footerNote}>
              This confirmation was sent automatically. Please do not reply to this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '580px',
};

const header = {
  padding: '32px 24px',
  textAlign: 'center' as const,
  backgroundColor: '#2563eb',
  borderRadius: '8px 8px 0 0',
};

const h1 = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '32px',
  margin: '0',
};

const content = {
  padding: '24px',
};

const greeting = {
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px',
  color: '#374151',
};

const paragraph = {
  fontSize: '14px',
  lineHeight: '20px',
  margin: '16px 0',
  color: '#6b7280',
};

const appointmentDetails = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const detailRow = {
  fontSize: '14px',
  lineHeight: '20px',
  margin: '8px 0',
  color: '#374151',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '20px 0',
};

const footer = {
  padding: '0 24px',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#6b7280',
  margin: '0 0 12px',
};

const footerNote = {
  fontSize: '12px',
  lineHeight: '16px',
  color: '#9ca3af',
  margin: '0',
}; 