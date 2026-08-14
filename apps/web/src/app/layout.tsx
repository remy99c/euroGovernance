import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'euroGovernance - Multi-Tenant B2B GRC Platform',
  description: 'Automated compliance operating system for GDPR, EU AI Act, EU Data Act, ISO 27001, and ISO 42001.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
