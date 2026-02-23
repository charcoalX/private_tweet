"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation, Message, WsEvent } from "@private-tweet/types";
import { api } from "@/lib/api";
import {
  getOrInitKeyPair,
  encryptMessage,
  decryptMessage,
  isEncryptedContent,
} from "@/lib/e2e";

// ── helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── sub-components ─────────────────────────────────────────────────────────────

function ConvItem({
  conv,
  active,
  meId,
  decryptedContents,
  onClick,
}: {
  conv: Conversation;
  active: boolean;
  meId: string;
  decryptedContents: Record<string, string>;
  onClick: () => void;
}) {
  const lastMsgPreview = (() => {
    if (!conv.lastMessage) return "No messages yet";
    const prefix = conv.lastMessage.senderId === meId ? "You: " : "";
    const raw = conv.lastMessage.content;
    if (isEncryptedContent(raw)) {
      const decrypted = decryptedContents[conv.lastMessage.id];
      return decrypted ? prefix + decrypted : "🔒 Encrypted message";
    }
    return prefix + raw;
  })();

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface-700 transition-colors ${
        active ? "bg-surface-700" : ""
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
        {conv.otherUser.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={conv.otherUser.avatarUrl}
            alt={conv.otherUser.username}
            className="w-full h-full object-cover"
          />
        ) : (
          conv.otherUser.username[0].toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-100 truncate">
            {conv.otherUser.username}
          </span>
          {conv.lastMessage && (
            <span className="text-xs text-slate-500 shrink-0 ml-2">
              {formatTime(conv.lastMessage.createdAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {conv.unreadCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0" />
          )}
          <span
            className={`text-sm truncate ${
              conv.unreadCount > 0
                ? "text-slate-200 font-medium"
                : "text-slate-500"
            }`}
          >
            {lastMsgPreview}
          </span>
        </div>
      </div>
    </button>
  );
}

function MessageBubble({
  msg,
  isMe,
  displayContent,
}: {
  msg: Message;
  isMe: boolean;
  displayContent: string;
}) {
  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm break-words ${
          isMe
            ? "bg-brand-500 text-white rounded-br-sm"
            : "bg-surface-700 text-slate-100 rounded-bl-sm"
        }`}
      >
        {displayContent}
        <span
          className={`block text-[10px] mt-1 ${
            isMe ? "text-brand-200 text-right" : "text-slate-500"
          }`}
        >
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialConversations: Conversation[];
  meId: string;
}

export function MessagesClient({ initialConversations, meId }: Props) {
  const [convs, setConvs] = useState<Conversation[]>(initialConversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; username: string; avatarUrl: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  // ── E2E state ───────────────────────────────────────────────────────────────
  const [e2eReady, setE2eReady] = useState(false);
  const [decryptedContents, setDecryptedContents] = useState<Record<string, string>>({});
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const publicKeyB64Ref = useRef<string | null>(null);
  const decryptingIdsRef = useRef(new Set<string>());

  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeConvRef = useRef<string | null>(null);

  activeConvRef.current = activeConvId;

  // ── E2E key initialisation ──────────────────────────────────────────────────

  useEffect(() => {
    // getOrInitKeyPair is cached at module level — if E2EInitializer (in the layout)
    // already started key generation, this awaits the same promise without re-running it.
    getOrInitKeyPair(meId)
      .then((result) => {
        if (result) {
          privateKeyRef.current = result.privateKey;
          publicKeyB64Ref.current = result.publicKeyB64;
          // Upload in case this is a fresh key (E2EInitializer may not have run yet)
          api
            .put("/api/users/me/public-key", { publicKey: result.publicKeyB64 })
            .catch(() => undefined);
        }
        // Refetch conversations so otherUser.publicKey reflects the latest DB state.
        // The server-side initialConversations was rendered before keys were uploaded.
        return api
          .get<{ data: Conversation[] }>("/api/messages/conversations")
          .then((r) => setConvs(r.data))
          .catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => setE2eReady(true));
  }, [meId]);

  // ── Decrypt incoming messages ───────────────────────────────────────────────

  useEffect(() => {
    const privKey = privateKeyRef.current;
    if (!privKey || messages.length === 0) return;

    const toDecrypt = messages.filter(
      (m) => isEncryptedContent(m.content) && !decryptingIdsRef.current.has(m.id)
    );
    if (toDecrypt.length === 0) return;

    toDecrypt.forEach((m) => decryptingIdsRef.current.add(m.id));

    Promise.all(
      toDecrypt.map(async (m) => {
        const plaintext = await decryptMessage(privKey, m.senderId === meId, m.content);
        return [m.id, plaintext ?? "🔒 [Cannot decrypt]"] as [string, string];
      })
    ).then((entries) => {
      setDecryptedContents((prev) => {
        const next = { ...prev };
        for (const [id, content] of entries) next[id] = content;
        return next;
      });
    });
  }, [messages, meId]);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
    let ws: WebSocket;
    let destroyed = false;
    let reconnectDelay = 1_000;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(`${wsUrl}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelay = 1_000;
      };

      ws.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data as string) as WsEvent;

          if (event.type === "new_message") {
            const { conversationId, message } = event;
            // If this is the active conversation, append to thread
            if (activeConvRef.current === conversationId) {
              // Guard against double-fire (React StrictMode / multiple WS connections)
              setMessages((prev) =>
                prev.some((m) => m.id === message.id) ? prev : [...prev, message]
              );
              // Mark read immediately
              api
                .post(`/api/messages/conversations/${conversationId}/read`)
                .catch(() => undefined);
            }
            // Update conversation list
            setConvs((prev) => {
              const idx = prev.findIndex((c) => c.id === conversationId);
              if (idx === -1) {
                // New conversation — refetch list
                api
                  .get<{ data: Conversation[] }>("/api/messages/conversations")
                  .then((r) => setConvs(r.data))
                  .catch(() => undefined);
                return prev;
              }
              const updated = [...prev];
              const conv = { ...updated[idx] };
              conv.lastMessage = message;
              conv.updatedAt = message.createdAt;
              if (activeConvRef.current !== conversationId) {
                conv.unreadCount = (conv.unreadCount ?? 0) + 1;
              }
              updated.splice(idx, 1);
              updated.unshift(conv);
              return updated;
            });
          } else if (event.type === "messages_read") {
            // Clear unread badge for that conversation
            setConvs((prev) =>
              prev.map((c) =>
                c.id === event.conversationId ? { ...c, unreadCount: 0 } : c
              )
            );
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
            connect();
          }, reconnectDelay);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // ── Load messages for active conversation ──────────────────────────────────

  const loadMessages = useCallback(
    async (convId: string, cursor?: string) => {
      setLoadingMsgs(true);
      try {
        const url =
          `/api/messages/conversations/${convId}/messages` +
          (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
        const res = await api.get<{
          data: Message[];
          nextCursor: string | null;
          hasMore: boolean;
        }>(url);
        if (cursor) {
          // Prepend older messages
          setMessages((prev) => [...res.data, ...prev]);
        } else {
          setMessages(res.data);
        }
        setHasMore(res.hasMore);
        setNextCursor(res.nextCursor);
      } catch {
        // ignore
      } finally {
        setLoadingMsgs(false);
      }
    },
    []
  );

  const selectConversation = useCallback(
    async (convId: string) => {
      setActiveConvId(convId);
      setMessages([]);
      setHasMore(false);
      setNextCursor(null);
      setMobileShowThread(true);
      await loadMessages(convId);
      // Mark as read
      api
        .post(`/api/messages/conversations/${convId}/read`)
        .catch(() => undefined);
      // Clear unread locally
      setConvs((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
    },
    [loadMessages]
  );

  // Scroll to bottom when messages load (not when loading older)
  useEffect(() => {
    if (!loadingMsgs) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [activeConvId, loadingMsgs]);

  // Scroll to bottom on new message
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  // ── Search users ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get<{
          data: { id: string; username: string; avatarUrl: string | null }[];
        }>(`/api/users/search?q=${encodeURIComponent(searchQuery)}&limit=5`);
        setSearchResults(res.data.filter((u) => u.id !== meId));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, meId]);

  const startConversationWith = useCallback(
    async (userId: string) => {
      try {
        const res = await api.post<{ data: Conversation }>(
          "/api/messages/conversations",
          { recipientId: userId }
        );
        const conv = res.data;
        setConvs((prev) => {
          const exists = prev.find((c) => c.id === conv.id);
          if (exists) return prev;
          return [conv, ...prev];
        });
        setSearchQuery("");
        setSearchResults([]);
        await selectConversation(conv.id);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Cannot start conversation";
        alert(msg);
      }
    },
    [selectConversation]
  );

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activeConvId || sending) return;

    const currentConv = convs.find((c) => c.id === activeConvId);
    const recipientPublicKey = currentConv?.otherUser.publicKey ?? null;
    const senderPublicKey = publicKeyB64Ref.current;

    if (!recipientPublicKey || !senderPublicKey || !privateKeyRef.current) return;

    const content = input.trim();
    setInput("");
    setSending(true);

    try {
      const ciphertext = await encryptMessage(senderPublicKey, recipientPublicKey, content);
      const res = await api.post<{ data: Message }>(
        `/api/messages/conversations/${activeConvId}/messages`,
        { content: ciphertext }
      );
      // WS event will display the message; just update the conversation list.
      setConvs((prev) =>
        prev.map((c) =>
          c.id === activeConvId
            ? { ...c, lastMessage: res.data, updatedAt: res.data.createdAt }
            : c
        )
      );
    } catch {
      setInput(content); // restore input on error
    } finally {
      setSending(false);
    }
  }, [input, activeConvId, sending, convs]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const activeConv = convs.find((c) => c.id === activeConvId);

  // Whether this conversation supports E2E (both sides have keys)
  const e2eEnabled =
    e2eReady &&
    Boolean(privateKeyRef.current) &&
    Boolean(activeConv?.otherUser.publicKey);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-56px)] -mt-6 -mx-4 border-t border-surface-700">
      {/* Left panel — conversation list */}
      <div
        className={`w-full md:w-80 shrink-0 border-r border-surface-700 flex flex-col ${
          mobileShowThread ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Search bar */}
        <div className="p-3 border-b border-surface-700 relative">
          <input
            type="text"
            placeholder="Search users to message…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-700 text-slate-100 rounded-lg px-3 py-2 text-sm outline-none placeholder-slate-500 focus:ring-1 focus:ring-brand-500"
          />
          {(searchResults.length > 0 || searching) && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-surface-800 border border-surface-600 rounded-lg shadow-xl z-10 overflow-hidden">
              {searching && (
                <div className="px-4 py-3 text-sm text-slate-400">
                  Searching…
                </div>
              )}
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startConversationWith(u.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-700 text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {u.username[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-slate-100">{u.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              No conversations yet.
              <br />
              Search for a user above to start one.
            </div>
          ) : (
            convs.map((c) => (
              <ConvItem
                key={c.id}
                conv={c}
                active={c.id === activeConvId}
                meId={meId}
                decryptedContents={decryptedContents}
                onClick={() => selectConversation(c.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel — message thread */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          mobileShowThread ? "flex" : "hidden md:flex"
        }`}
      >
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select a conversation to start chatting
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-surface-700 flex items-center gap-3">
              <button
                className="md:hidden text-slate-400 hover:text-slate-100 mr-1"
                onClick={() => setMobileShowThread(false)}
              >
                ←
              </button>
              <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold shrink-0">
                {activeConv.otherUser.username[0].toUpperCase()}
              </div>
              <span className="font-semibold text-slate-100">
                {activeConv.otherUser.username}
              </span>
              {/* E2E badge */}
              <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400 select-none">
                {e2eEnabled ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    End-to-end encrypted
                  </>
                ) : e2eReady ? (
                  <span className="text-amber-400">Encryption unavailable</span>
                ) : (
                  <span className="text-slate-500">Setting up encryption…</span>
                )}
              </span>
            </div>

            {/* Messages scroll area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col">
              {hasMore && (
                <button
                  onClick={() =>
                    activeConvId && nextCursor
                      ? loadMessages(activeConvId, nextCursor)
                      : undefined
                  }
                  disabled={loadingMsgs}
                  className="self-center mb-4 text-sm text-brand-400 hover:text-brand-300 disabled:opacity-50"
                >
                  {loadingMsgs ? "Loading…" : "Load older messages"}
                </button>
              )}
              {messages.map((msg) => {
                const raw = msg.content;
                const displayContent = isEncryptedContent(raw)
                  ? (decryptedContents[msg.id] ?? "Decrypting…")
                  : raw;
                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isMe={msg.senderId === meId}
                    displayContent={displayContent}
                  />
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div className="px-4 py-3 border-t border-surface-700">
              {/* Warning when recipient has no public key yet */}
              {e2eReady && !activeConv.otherUser.publicKey && (
                <p className="text-xs text-amber-400 mb-2 px-1">
                  Recipient hasn&apos;t set up E2E encryption yet. Ask them to open
                  Messages first.
                </p>
              )}
              <div className="flex gap-3 items-end">
                <textarea
                  rows={1}
                  placeholder={
                    !e2eReady
                      ? "Setting up encryption…"
                      : !activeConv.otherUser.publicKey
                      ? "Encryption unavailable"
                      : "Write a message…"
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!e2eEnabled}
                  className="flex-1 bg-surface-700 text-slate-100 rounded-xl px-4 py-2.5 text-sm outline-none placeholder-slate-500 focus:ring-1 focus:ring-brand-500 resize-none max-h-32 overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ minHeight: "40px" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending || !e2eEnabled}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shrink-0"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
