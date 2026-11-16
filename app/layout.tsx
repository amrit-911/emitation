import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Emitation — timesheets you just ask for",
  description:
    "Describe your week in one sentence. Emitation reads your commits, folders and notes, writes your Emit timesheet, and pushes it.",
};

export const viewport: Viewport = {
  themeColor: "#04050a",
};

/** Applies the saved accent before first paint so the page never flashes the default. */
const preference = `try{var s=JSON.parse(localStorage.getItem("emitation.settings.v1")||"{}");var r=document.documentElement;if(s.accent)r.dataset.accent=s.accent;if(s.reduceMotion)r.dataset.motion="reduced";}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: preference }} />
      </head>
      <body className="relative min-h-full font-sans">
        <div className="aurora" aria-hidden>
          <div className="aurora__blob" />
          <div className="aurora__blob" />
          <div className="aurora__blob" />
          <div className="aurora__blob" />
          <div className="aurora__veil" />
          <div className="aurora__grain" />
        </div>
        <div className="edge-glow" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
