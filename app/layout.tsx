import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ForenxStoreProvider>{children}</ForenxStoreProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
