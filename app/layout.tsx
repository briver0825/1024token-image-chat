import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "yet-another-react-lightbox/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "image-chat",
  description: "使用 gpt-image-2 的聊天生图工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider delayDuration={0}>
          {children}
          <Toaster richColors theme="dark" />
        </TooltipProvider>
      </body>
    </html>
  );
}
