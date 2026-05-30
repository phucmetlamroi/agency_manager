import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveHomeDestination } from "@/lib/post-login";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "HustlyTasker — Point Velox at a folder. Get a task board.",
  description:
    "The operating system for high-volume video agencies. Velox scans your Drive or Dropbox, reads the patterns in your files, and auto-generates a fully assigned task board — tasks, roles, deadlines, all pre-filled.",
  openGraph: {
    title: "HustlyTasker — Point Velox at a folder. Get a task board.",
    description:
      "Velox auto-builds your next project board from a cloud folder. Operations, clients, dual-currency finance and KPIs — under one pane of glass.",
    type: "website",
    siteName: "HustlyTasker",
  },
};

export default async function Home() {
  // Logged-in visitors skip the marketing page and go straight into the app.
  const session = await getSession();
  if (session?.user) {
    redirect(await resolveHomeDestination(session.user));
  }

  // Guests see the public landing page.
  return <LandingPage />;
}
