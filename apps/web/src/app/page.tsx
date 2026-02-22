import { redirect } from "next/navigation";

// Root page — middleware will redirect unauthenticated users to /login first.
// Authenticated users landing here get pushed to their feed.
export default function HomePage() {
  redirect("/feed");
}
