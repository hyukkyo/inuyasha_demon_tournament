import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  GameState,
  PlayerSession,
  ResolveEvent,
  ResolveStep,
  RoomErrorPayload,
  RoomRole,
  RoomState,
  ServerToClientEvents,
  StateSnapshot,
} from "@inuyasha/shared";

type ConnectionState = {
  connected: boolean;
  snapshot?: StateSnapshot;
  roomState?: RoomState;
  gameState?: GameState;
  playerSession?: PlayerSession;
  roomError?: RoomErrorPayload;
  opponentConfirmedRole?: RoomRole;
  opponentCardsConfirmedRole?: RoomRole;
  resolveQueue: ResolveStep[];
  activeResolveStep?: ResolveStep;
  activeResolveEventIndex: number;
  socket?: Socket<ServerToClientEvents, ClientToServerEvents>;
  connect: () => void;
  disconnect: () => void;
  clearError: () => void;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  reconnectRoom: (roomId: string, playerToken: string) => void;
  leaveGame: (roomId: string, playerToken: string) => void;
  selectCharacter: (characterId: string) => void;
  confirmCharacter: (characterId: string) => void;
  updateCards: (selectedCardIds: string[]) => void;
  confirmCards: (selectedCardIds: string[]) => void;
  resetResolvePlayback: () => void;
  advanceResolvePlayback: () => void;
};

export const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
export const SESSION_STORAGE_KEY = "inuyasha_demon_tournament_session";

const persistSession = (session?: PlayerSession) => {
  if (session) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
};

export const readPersistedSession = () => {
  const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

  if (!rawSession) {
    return undefined;
  }

  return JSON.parse(rawSession) as PlayerSession;
};

export const useGameStore = create<ConnectionState>((set, get) => ({
  connected: false,
  snapshot: undefined,
  roomState: undefined,
  gameState: undefined,
  playerSession: undefined,
  roomError: undefined,
  opponentConfirmedRole: undefined,
  opponentCardsConfirmedRole: undefined,
  resolveQueue: [],
  activeResolveStep: undefined,
  activeResolveEventIndex: 0,
  socket: undefined,
  connect: () => {
    if (get().socket) {
      return;
    }

    const socket = io(serverUrl, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      set({ connected: true, roomError: undefined });

      const session = readPersistedSession();

      if (session) {
        socket.emit("room:reconnect", {
          roomId: session.roomId,
          playerToken: session.playerToken,
        });
      }
    });

    socket.on("disconnect", () => {
      set({ connected: false, socket: undefined });
    });

    socket.on("state:snapshot", (snapshot) => {
      set((state) => ({
        snapshot,
        roomState: snapshot.roomState ?? state.roomState,
        gameState: snapshot.gameState ?? state.gameState,
        playerSession: snapshot.playerSession ?? state.playerSession,
      }));
    });

    socket.on("room:created", (payload) => {
      const session = {
        roomId: payload.roomId,
        playerToken: payload.playerToken,
        role: payload.role,
      } satisfies PlayerSession;
      persistSession(session);

      set({
        roomState: payload.roomState,
        playerSession: session,
        gameState: undefined,
        roomError: undefined,
        opponentConfirmedRole: undefined,
        opponentCardsConfirmedRole: undefined,
        resolveQueue: [],
        activeResolveStep: undefined,
        activeResolveEventIndex: 0,
      });
    });

    socket.on("room:joined", (payload) => {
      const session = {
        roomId: payload.roomId,
        playerToken: payload.playerToken,
        role: payload.role,
      } satisfies PlayerSession;
      persistSession(session);

      set({
        roomState: payload.roomState,
        playerSession: session,
        gameState: undefined,
        roomError: undefined,
        opponentConfirmedRole: undefined,
        opponentCardsConfirmedRole: undefined,
        resolveQueue: [],
        activeResolveStep: undefined,
        activeResolveEventIndex: 0,
      });
    });

    socket.on("room:error", (payload) => {
      set({ roomError: payload });
    });

    socket.on("match:ready", (payload) => {
      set({ gameState: payload.gameState });
    });

    socket.on("character:phase_started", (payload) => {
      set({ gameState: payload.gameState, opponentConfirmedRole: undefined });
    });

    socket.on("character:opponent_confirmed", (payload) => {
      if (payload.confirmed) {
        set({ opponentConfirmedRole: payload.role });
      }
    });

    socket.on("cards:phase_started", (payload) => {
      set({
        gameState: payload.gameState,
        opponentCardsConfirmedRole: undefined,
        resolveQueue: [],
        activeResolveStep: undefined,
        activeResolveEventIndex: 0,
      });
    });

    socket.on("cards:opponent_confirmed", (payload) => {
      if (payload.confirmed) {
        set({ opponentCardsConfirmedRole: payload.role });
      }
    });

    socket.on("game:resumed", (payload) => {
      set({ gameState: payload.gameState });
    });

    socket.on("resolve:step", (step) => {
      set((state) => {
        const resolveQueue = [...state.resolveQueue, step];
        const activeResolveStep = state.activeResolveStep ?? step;

        return {
          resolveQueue,
          activeResolveStep,
          activeResolveEventIndex: state.activeResolveStep ? state.activeResolveEventIndex : 0,
        };
      });
    });

    socket.on("game:finished", () => {
      persistSession(undefined);
    });

    set({ socket });
  },
  disconnect: () => {
    get().socket?.disconnect();
    set({ connected: false, socket: undefined });
  },
  clearError: () => {
    set({ roomError: undefined });
  },
  createRoom: () => {
    get().socket?.emit("room:create");
  },
  joinRoom: (roomId: string) => {
    get().socket?.emit("room:join", { roomId: roomId.trim().toUpperCase() });
  },
  reconnectRoom: (roomId: string, playerToken: string) => {
    get().socket?.emit("room:reconnect", { roomId, playerToken });
  },
  leaveGame: (roomId: string, playerToken: string) => {
    get().socket?.emit("game:leave", { roomId, playerToken });
    persistSession(undefined);
    set({
      roomState: undefined,
      gameState: undefined,
      playerSession: undefined,
      roomError: undefined,
      opponentConfirmedRole: undefined,
      opponentCardsConfirmedRole: undefined,
      resolveQueue: [],
      activeResolveStep: undefined,
      activeResolveEventIndex: 0,
    });
  },
  selectCharacter: (characterId: string) => {
    get().socket?.emit("character:select", { characterId });
  },
  confirmCharacter: (characterId: string) => {
    get().socket?.emit("character:confirm", { characterId });
  },
  updateCards: (selectedCardIds: string[]) => {
    get().socket?.emit("cards:update", { selectedCardIds });
  },
  confirmCards: (selectedCardIds: string[]) => {
    get().socket?.emit("cards:confirm", { selectedCardIds });
  },
  resetResolvePlayback: () => {
    const queue = get().resolveQueue;
    set({
      activeResolveStep: queue[0],
      activeResolveEventIndex: 0,
    });
  },
  advanceResolvePlayback: () => {
    const { activeResolveStep, activeResolveEventIndex, resolveQueue } = get();

    if (!activeResolveStep) {
      set({
        activeResolveStep: resolveQueue[0],
        activeResolveEventIndex: 0,
      });
      return;
    }

    const nextIndex = activeResolveEventIndex + 1;

    if (nextIndex < activeResolveStep.events.length) {
      set({ activeResolveEventIndex: nextIndex });
      return;
    }

    const currentQueueIndex = resolveQueue.findIndex((step) => step.stepIndex === activeResolveStep.stepIndex);
    const nextStep = currentQueueIndex >= 0 ? resolveQueue[currentQueueIndex + 1] : undefined;

    set({
      activeResolveStep: nextStep,
      activeResolveEventIndex: 0,
    });
  },
}));
