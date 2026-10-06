import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QRServe — Multi-Tenant Restaurant QR Ordering Platform",
  description:
    "Direct table QR ordering platform for restaurants with counter-pay convenience, multi-tenant owner dashboard, and Super Admin verification controls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-950 text-slate-100 font-sans selection:bg-amber-500/20 selection:text-amber-300">
        {children}
      </body>
    </html>
  );
}
