import type { Metadata } from "next";
import "./globals.css";
import { ForenxStoreProvider } from "./ui/forenx-store";
import { PwaRegister } from "./ui/pwa-register";

export const metadata: Metadata = {
  title: "FORENX Evidence Tracking",
  description: "Barcode-based evidence tracking website prototype",
  manifest: "/manifest.webmanifest"
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
