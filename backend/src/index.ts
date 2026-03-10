import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import {
  CHARACTER_SELECT_TIMEOUT_SECONDS,
  ROOM_ID_LENGTH,
  type CharacterSelectPayload,
  type ClientToServerEvents,
  type GameState,
  type PlayerSession,
  type RoomErrorPayload,
  type RoomRole,
  type ServerToClientEvents,
} from "@inuyasha/shared";
import { CHARACTER_POOL, DEFAULT_CHARACTER_ID } from "./characters.js";
import {
  allPlayersConfirmedCharacters,
  cleanupExpiredRooms,
  createRoom,
  joinRoom,
  markConnected,
  markDisconnected,
  startCharacterSelect,
  syncCharacterSelectState,
  toRoomState,
  type RoomRecord,
  type RoomStore,
  type SocketSessionStore,
} from "./rooms.js";

const DEFAULT_PORT = 3001;
const DEFAULT_FRONTEND_ORIGIN = "http://localhost:5173";

const pingPayloadSchema = z.object({
  timestamp: z.number().int().nonnegative(),
});

const roomJoinPayloadSchema = z.object({
  roomId: z.string().trim().length(ROOM_ID_LENGTH),
  playerToken: z.string().trim().optional(),
});

const characterSelectPayloadSchema = z.object({
  characterId: z.string().trim().min(1),
});

const app = Fastify({
  logger: true,
});

const rooms: RoomStore = new Map();
const socketSessions: SocketSessionStore = new Map();
const characterSelectTimers = new Map<string, NodeJS.Timeout>();

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const emitRoomError = (socket: GameSocket, payload: RoomErrorPayload) => {
  socket.emit("room:error", payload);
};

const emitSnapshot = (socket: GameSocket, message: string, session?: PlayerSession) => {
  const roomState = session ? rooms.get(session.roomId) : undefined;

  socket.emit("state:snapshot", {
    serverTime: Date.now(),
    phase: roomState?.gameState?.phase ?? "waiting",
    message,
    roomState: roomState ? toRoomState(roomState) : undefined,
    playerSession: session,
    gameState: roomState?.gameState,
  });
};

const emitRoomSnapshot = (room: RoomRecord, message: string) => {
  io.to(room.id).emit("state:snapshot", {
    serverTime: Date.now(),
    phase: room.gameState?.phase ?? "waiting",
    message,
    roomState: toRoomState(room),
    gameState: room.gameState,
  });
};

const clearCharacterSelectTimer = (roomId: string) => {
  const timer = characterSelectTimers.get(roomId);

  if (timer) {
    clearTimeout(timer);
    characterSelectTimers.delete(roomId);
  }
};

const finishCharacterSelect = (room: RoomRecord, reason: string) => {
  clearCharacterSelectTimer(room.id);
  room.gameState = {
    phase: "card_select",
  };
  emitRoomSnapshot(room, reason);
};

const scheduleCharacterSelectDeadline = (room: RoomRecord) => {
  clearCharacterSelectTimer(room.id);

  const delay = Math.max((room.gameState?.turnDeadline ?? Date.now()) - Date.now(), 0);
  const timer = setTimeout(() => {
    for (const player of room.players) {
      if (!player || player.characterConfirmed) {
        continue;
      }

      player.characterId = player.characterId ?? DEFAULT_CHARACTER_ID;
      player.characterConfirmed = true;
      player.characterTimedOut = true;
    }

    syncCharacterSelectState(room, CHARACTER_POOL);
    finishCharacterSelect(room, "Character select timed out and was auto-confirmed.");
  }, delay);

  characterSelectTimers.set(room.id, timer);
};

const beginCharacterSelect = (room: RoomRecord) => {
  startCharacterSelect(
    room,
    Date.now(),
    CHARACTER_POOL.map((character) => character.id),
  );
  syncCharacterSelectState(room, CHARACTER_POOL);
  scheduleCharacterSelectDeadline(room);

  io.to(room.id).emit("match:ready", {
    gameState: room.gameState as GameState,
  });
  io.to(room.id).emit("character:phase_started", {
    remainingSeconds: CHARACTER_SELECT_TIMEOUT_SECONDS,
    gameState: room.gameState as GameState,
  });
  emitRoomSnapshot(room, "Character select phase started.");
};

const confirmCharacter = (
  room: RoomRecord,
  role: RoomRole,
  payload: CharacterSelectPayload,
): { ok: true } | { ok: false; error: RoomErrorPayload } => {
  const player = room.players.find((entry) => entry?.role === role);

  if (!player || room.gameState?.phase !== "character_select") {
    return {
      ok: false,
      error: {
        code: "INVALID_ROOM_ID",
        message: "Character select is not active for this room.",
      } as RoomErrorPayload,
    };
  }

  const exists = CHARACTER_POOL.some((character) => character.id === payload.characterId);

  if (!exists) {
    return {
      ok: false,
      error: {
        code: "INVALID_ROOM_ID",
        message: "Unknown character ID.",
      } as RoomErrorPayload,
    };
  }

  player.characterId = payload.characterId;
  player.characterConfirmed = true;
  player.characterTimedOut = false;
  syncCharacterSelectState(room, CHARACTER_POOL);

  return { ok: true as const };
};

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

const cleanupTimer = setInterval(() => {
  cleanupExpiredRooms(rooms, socketSessions, Date.now());
}, 30_000);

cleanupTimer.unref();

io.on("connection", (socket) => {
  app.log.info({ socketId: socket.id }, "socket connected");

  emitSnapshot(socket, "Socket connection established.");

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

    const session = socketSessions.get(socket.id);
    emitSnapshot(socket, `Ping received: ${result.data.timestamp}`, session);
  });

  socket.on("room:create", () => {
    cleanupExpiredRooms(rooms, socketSessions, Date.now());

    if (socketSessions.has(socket.id)) {
      emitRoomError(socket, {
        code: "ALREADY_IN_ROOM",
        message: "Leave the current room before creating a new one.",
      });
      return;
    }

    const room = createRoom(rooms, socket.id, Date.now());
    const session: PlayerSession = {
      roomId: room.id,
      playerToken: room.players[0].token,
      role: "host",
    };

    socket.join(room.id);
    socketSessions.set(socket.id, session);
    socket.emit("room:created", {
      roomId: room.id,
      playerToken: session.playerToken,
      role: session.role,
      roomState: toRoomState(room),
    });
    emitSnapshot(socket, "Room created successfully.", session);
  });

  socket.on("room:join", (payload) => {
    cleanupExpiredRooms(rooms, socketSessions, Date.now());

    if (socketSessions.has(socket.id)) {
      emitRoomError(socket, {
        code: "ALREADY_IN_ROOM",
        message: "Leave the current room before joining another one.",
      });
      return;
    }

    const result = roomJoinPayloadSchema.safeParse(payload);

    if (!result.success) {
      emitRoomError(socket, {
        code: "INVALID_ROOM_ID",
        message: `Room ID must be exactly ${ROOM_ID_LENGTH} characters.`,
      });
      return;
    }

    const roomId = result.data.roomId.toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      emitRoomError(socket, {
        code: "ROOM_NOT_FOUND",
        message: "The room does not exist or has already expired.",
      });
      return;
    }

    const joinResult = joinRoom(room, socket.id, Date.now());

    if (!joinResult.ok) {
      emitRoomError(socket, {
        code: joinResult.code,
        message: joinResult.message,
      });
      return;
    }

    socket.join(room.id);
    socketSessions.set(socket.id, joinResult.session);
    markConnected(rooms, joinResult.session, socket.id);
    socket.emit("room:joined", {
      roomId: room.id,
      playerToken: joinResult.session.playerToken,
      role: joinResult.session.role,
      roomState: toRoomState(room),
    });

    emitRoomSnapshot(room, "Guest joined the room.");

    if (room.players[0] && room.players[1]) {
      beginCharacterSelect(room);
    }
  });

  socket.on("character:select", (payload) => {
    const session = socketSessions.get(socket.id);

    if (!session) {
      emitRoomError(socket, {
        code: "ALREADY_IN_ROOM",
        message: "Join a room before selecting a character.",
      });
      return;
    }

    const parseResult = characterSelectPayloadSchema.safeParse(payload);

    if (!parseResult.success) {
      emitRoomError(socket, {
        code: "INVALID_ROOM_ID",
        message: "Character ID is required.",
      });
      return;
    }

    const room = rooms.get(session.roomId);

    if (!room || room.gameState?.phase !== "character_select") {
      emitRoomError(socket, {
        code: "ROOM_NOT_FOUND",
        message: "Character select is not currently available.",
      });
      return;
    }

    const player = room.players.find((entry) => entry?.role === session.role);
    const exists = CHARACTER_POOL.some((character) => character.id === parseResult.data.characterId);

    if (!player || !exists) {
      emitRoomError(socket, {
        code: "INVALID_ROOM_ID",
        message: "Unknown character ID.",
      });
      return;
    }

    player.characterId = parseResult.data.characterId;
    player.characterConfirmed = false;
    player.characterTimedOut = false;
    syncCharacterSelectState(room, CHARACTER_POOL);
    emitRoomSnapshot(room, `${session.role} selected a character.`);
  });

  socket.on("character:confirm", (payload) => {
    const session = socketSessions.get(socket.id);

    if (!session) {
      emitRoomError(socket, {
        code: "ALREADY_IN_ROOM",
        message: "Join a room before confirming a character.",
      });
      return;
    }

    const parseResult = characterSelectPayloadSchema.safeParse(payload);

    if (!parseResult.success) {
      emitRoomError(socket, {
        code: "INVALID_ROOM_ID",
        message: "Character ID is required.",
      });
      return;
    }

    const room = rooms.get(session.roomId);

    if (!room) {
      emitRoomError(socket, {
        code: "ROOM_NOT_FOUND",
        message: "The room does not exist.",
      });
      return;
    }

    const result = confirmCharacter(room, session.role, parseResult.data);

    if (!result.ok) {
      emitRoomError(socket, result.error);
      return;
    }

    socket.to(room.id).emit("character:opponent_confirmed", {
      confirmed: true,
      role: session.role,
    });
    emitRoomSnapshot(room, `${session.role} confirmed a character.`);

    if (allPlayersConfirmedCharacters(room)) {
      finishCharacterSelect(room, "Both players confirmed their characters.");
    }
  });

  socket.on("disconnect", (reason) => {
    const session = socketSessions.get(socket.id);

    markDisconnected(rooms, session);
    socketSessions.delete(socket.id);
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
