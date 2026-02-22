import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private Tweet",
  description: "A private microblogging platform for invited friends",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex,nofollow,noarchive" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
