import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { PrototypeBadge } from "@/components/prototype-badge";
import { StudyBadge } from "@/components/study-badge";
import { getStudyCondition } from "@/lib/study/study-cookie";
import "@/styles/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Medication Companion — prototype",
  description:
    "A safety-bounded AI companion prototype that explains a fictional pharmacy record. Not a medical device.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FAF9F6",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const study = await getStudyCondition(); // always null unless study mode is on (never production)
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="antialiased">
        <PrototypeBadge />
        <StudyBadge condition={study} />
        {children}
      </body>
    </html>
  );
}
