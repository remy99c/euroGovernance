import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';

export const metadata: Metadata = {
  title: 'euroGovernance - Sovereign EU GRC SaaS',
  description: 'Automated compliance operating system for GDPR, EU AI Act, EU Data Act, ISO 27001, and ISO 42001.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
