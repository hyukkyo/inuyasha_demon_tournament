import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { z } from "zod";
import type { ClientToServerEvents, ServerToClientEvents } from "@inuyasha/shared";

const DEFAULT_PORT = 3001;
const DEFAULT_FRONTEND_ORIGIN = "http://localhost:5173";

const pingPayloadSchema = z.object({
  timestamp: z.number().int().nonnegative(),
});

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: process.env.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN,
  credentials: true,
});

app.get("/health", async () => {
  return {
    ok: true,
    now: Date.now(),
  };
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  app.log.info({ socketId: socket.id }, "socket connected");

  socket.emit("state:snapshot", {
    serverTime: Date.now(),
    phase: "waiting",
    message: "Socket connection established.",
  });

  socket.on("ping", (payload) => {
    const result = pingPayloadSchema.safeParse(payload);

    if (!result.success) {
      app.log.warn(
        {
          socketId: socket.id,
          issues: result.error.issues,
        },
        "invalid ping payload",
      );
      return;
    }

    socket.emit("state:snapshot", {
      serverTime: Date.now(),
      phase: "waiting",
      message: `Ping received: ${result.data.timestamp}`,
    });
  });

  socket.on("disconnect", (reason) => {
    app.log.info({ socketId: socket.id, reason }, "socket disconnected");
  });
});

const start = async () => {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    app.log.info(`HTTP and Socket.IO server listening on ${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

await start();
