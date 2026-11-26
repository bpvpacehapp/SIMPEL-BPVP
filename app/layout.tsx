import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "SIMPEL BPVP",
  description:
    "Sistem Informasi Manajemen Pelatihan — Ekosistem Digital BPVP Banda Aceh",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={poppins.variable} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-[#f4f6f9] dark:bg-[#0b1120] text-black dark:text-slate-100 text-[14px]">
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>{children}</SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
