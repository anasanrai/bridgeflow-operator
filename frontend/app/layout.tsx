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

const SITE_URL = "https://operator.bridgeflow.agency";
const OG_IMAGE = `${SITE_URL}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "BridgeFlow Operator",
  description:
    "Autonomous 5-agent sales pipeline · Built with Claude Opus 4.7 for the Built-with-4.7 hackathon.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
  },
  openGraph: {
    title: "BridgeFlow Operator · Built with Opus 4.7",
    description:
      "Drop a sales call. Five Opus 4.7 agents qualify, draft, fire, and self-review.",
    url: SITE_URL,
    siteName: "BridgeFlow Operator",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "BridgeFlow Operator · Built with Claude Opus 4.7",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BridgeFlow Operator · Built with Opus 4.7",
    description:
      "Drop a sales call. Five Opus 4.7 agents qualify, draft, fire, and self-review.",
    images: [OG_IMAGE],
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
