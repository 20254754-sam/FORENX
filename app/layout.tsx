import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ForenxStoreProvider } from "./ui/forenx-store";
import { PwaRegister } from "./ui/pwa-register";

export const metadata: Metadata = {
  title: "FORENX Evidence Tracking",
  description: "Secure barcode-based evidence tracking",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/images/forenx-x-logo.png", type: "image/png", sizes: "256x256" }],
    apple: [{ url: "/images/forenx-x-logo.png", type: "image/png", sizes: "256x256" }]
  }
};

// The proxy creates a per-request CSP nonce. Reading request headers keeps the
// app shell dynamic so Next attaches that nonce to its runtime scripts.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers();

  return (
    <html lang="en">
      <body>
        <ForenxStoreProvider>{children}</ForenxStoreProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
