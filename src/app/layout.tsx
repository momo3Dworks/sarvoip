import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { UserProvider } from '@/context/UserProvider';
import MatrixBackground from '@/components/common/matrix-background';

export const metadata: Metadata = {
  title: 'SARVOX - The Most & Free Private VOIP Service',
  description: 'Private voice calls with your friends.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <MatrixBackground />
        <UserProvider>
          <div className="relative z-10">
            {children}
          </div>
        </UserProvider>
        <Toaster />
      </body>
    </html>
  );
}
