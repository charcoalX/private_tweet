// ─── Core domain models ───────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  email: string;
  bio: string | null;
  avatarUrl: string | null;
  publicKey: string | null; // RSA-OAEP public key (SPKI, base64) — null until user visits Messages
  createdAt: string; // ISO 8601
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  mediaUrls: string[];
  replyToId: string | null;
  repostOfId: string | null;
  createdAt: string;
  deletedAt: string | null;
  // Aggregates optionally joined
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  isLiked?: boolean;
  author?: Pick<User, "id" | "username" | "avatarUrl">;
  repostOf?: Pick<Post, "id" | "content" | "mediaUrls" | "repostOfId" | "createdAt" | "deletedAt" | "author" | "repostOf"> | null;
}

export interface Follow {
  followerId: string;
  followeeId: string;
  createdAt: string;
}

export interface Like {
  userId: string;
  postId: string;
  createdAt: string;
}

export type NotificationType =
  | "like"
  | "follow"
  | "reply"
  | "repost"
  | "mention";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  actorId: string;
  postId: string | null;
  read: boolean;
  createdAt: string;
  actor?: Pick<User, "id" | "username" | "avatarUrl">;
}

export interface InviteCode {
  code: string;
  createdBy: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  sender?: Pick<User, "id" | "username" | "avatarUrl">;
}

export interface Conversation {
  id: string;
  participant1Id: string;
  participant2Id: string;
  createdAt: string;
  updatedAt: string;
  // The other participant (relative to the requesting user)
  otherUser: Pick<User, "id" | "username" | "avatarUrl" | "publicKey">;
  lastMessage: Message | null;
  unreadCount: number;
}

// ─── WebSocket events ─────────────────────────────────────────────────────────

export type WsEvent =
  | { type: "new_message"; conversationId: string; message: Message }
  | { type: "messages_read"; conversationId: string };

// ─── API envelope types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  expiresIn: number; // seconds
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  inviteCode: string;
}
