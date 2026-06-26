// ============================================================
// src/app/layout.tsx — Root layout con scaffold M3
// ============================================================
import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import { TripProvider }  from '@/components/layout/TripContext'
import { TopAppBar }     from '@/components/layout/TopAppBar'
import { BottomNav }     from '@/components/layout/BottomNav'
import './globals.css'

const font = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Wanderly — Pianifica insieme',
  description: 'Collaborative travel planner per gruppi in tempo reale',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Wanderly',
  },
}

export const viewport: Viewport = {
  themeColor: '#7C3AED',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={font.variable}>
      <body>
        <TripProvider>
          {/* Top App Bar M3 — fixed top */}
          <TopAppBar />

          {/* Contenuto pagine */}
          {children}

          {/* Bottom Navigation M3 — Suspense è dentro BottomNav per useSearchParams */}
          <BottomNav />
        </TripProvider>
      </body>
    </html>
  )
}
