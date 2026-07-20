import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { FhirDrawerProvider } from "@/components/resources/fhir-drawer";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Care Loop — Ops",
  description:
    "Internal operations view: vitals ingestion, ML risk scoring, and agentic risk assessment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen flex-col">
        <TooltipProvider delayDuration={200}>
          <FhirDrawerProvider>
            <div className="flex flex-1 flex-col">{children}</div>
          </FhirDrawerProvider>
        </TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
