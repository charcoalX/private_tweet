import fp from "fastify-plugin";
import websocket from "@fastify/websocket";
import type { SocketStream } from "@fastify/websocket";
import type { WebSocket } from "ws";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    // userId → set of open raw WebSocket connections
    wsClients: Map<string, Set<WebSocket>>;
    wsBroadcastToUser: (userId: string, payload: unknown) => void;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(websocket);

  const wsClients = new Map<string, Set<WebSocket>>();

  app.decorate("wsClients", wsClients);

  app.decorate("wsBroadcastToUser", (userId: string, payload: unknown) => {
    const sockets = wsClients.get(userId);
    if (!sockets) return;
    const text = JSON.stringify(payload);
    for (const ws of sockets) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(text);
      }
    }
  });

  // WS upgrade endpoint: GET /ws
  app.get(
    "/ws",
    { websocket: true },
    (connection: SocketStream, req) => {
      const rawSocket = connection.socket;

      // Authenticate via the access_token cookie
      let userId: string;
      try {
        const token = (req.cookies as Record<string, string | undefined>)?.access_token ?? "";
        const payload = app.jwt.verify<{ sub: string }>(token);
        userId = payload.sub;
      } catch {
        rawSocket.close(4001, "Unauthorized");
        return;
      }

      // Register connection
      if (!wsClients.has(userId)) wsClients.set(userId, new Set());
      wsClients.get(userId)!.add(rawSocket);

      rawSocket.on("close", () => {
        wsClients.get(userId)?.delete(rawSocket);
        if (wsClients.get(userId)?.size === 0) wsClients.delete(userId);
      });
    }
  );
};

export const wsPlugin = fp(plugin, { name: "ws", dependencies: ["auth"] });
