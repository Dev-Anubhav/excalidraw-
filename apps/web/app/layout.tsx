import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Antigravity Board | Real-Time Collaborative Whiteboard',
  description: 'A high-performance, real-time collaborative drawing whiteboard application built for designers and developers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen selection:bg-blue-600 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
