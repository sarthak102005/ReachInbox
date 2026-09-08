import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReachInbox — Email Job Scheduler',
  description:
    'Schedule, track, and manage email campaigns with intelligent rate limiting and real-time queue visibility.',
  keywords: ['email', 'scheduler', 'campaigns', 'automation'],
  openGraph: {
    title: 'ReachInbox — Email Job Scheduler',
    description: 'Production-grade email scheduling with BullMQ, Elasticsearch, and Slack notifications.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased min-h-screen bg-background text-text-primary">
        {children}
      </body>
    </html>
  );
}
