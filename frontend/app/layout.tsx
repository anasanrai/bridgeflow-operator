import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Shell } from "./components/Shell";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BridgeFlow Operator",
  description:
    "Autonomous 5-agent sales pipeline · Built with Claude Opus 4.7 for the Built-with-4.7 hackathon.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
  },
  openGraph: {
    title: "BridgeFlow Operator",
    description: "Drop a sales call. Five Opus 4.7 agents qualify, draft, fire, and self-review.",
    url: "https://github.com/anasanrai/bridgeflow-operator",
    siteName: "BridgeFlow Operator",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
