import type { Metadata } from "next"
import { Press_Start_2P, VT323 } from "next/font/google"
import "./globals.css"
import { CRTOverlay } from "@/components/CRTOverlay"

const pressStart2P = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
})

const vt323 = VT323({
  variable: "--font-pixel-readable",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
})

export const metadata: Metadata = {
  title: "PetCity",
  description: "Persistent AI agent pets on Ethereum. Adopt, raise, battle, breed.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${pressStart2P.variable} ${vt323.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-[color:var(--color-bg-deep)] text-[color:var(--color-ink)]">
        {children}
        <CRTOverlay />
      </body>
    </html>
  )
}
