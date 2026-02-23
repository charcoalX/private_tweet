import { getCurrentUser, serverFetch } from "@/lib/server-api";
import { redirect } from "next/navigation";
import { MessagesClient } from "@/components/MessagesClient";
import type { Conversation } from "@private-tweet/types";

export default async function MessagesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login?from=/messages");

  const conversations = await serverFetch<{ data: Conversation[] }>(
    "/api/messages/conversations"
  )
    .then((r) => r.data)
    .catch(() => [] as Conversation[]);

  return (
    <MessagesClient
      initialConversations={conversations}
      meId={currentUser.sub}
    />
  );
}
