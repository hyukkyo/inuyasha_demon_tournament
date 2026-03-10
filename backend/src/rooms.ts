import {
  CHARACTER_SELECT_TIMEOUT_SECONDS,
  CARD_SELECT_TIMEOUT_SECONDS,
  ROOM_EXPIRATION_MINUTES,
  ROOM_ID_LENGTH,
  type BattlePlayerState,
  type CharacterSelectState,
  type CardSelectState,
  type Card,
  type GameState,
  type PlayerSession,
  type RoomErrorCode,
  type RoomRole,
  type RoomState,
  type RoomStatus,
} from "@inuyasha/shared";

type PlayerRecord = {
  id: string;
  token: string;
  role: RoomRole;
  connected: boolean;
  socketId: string;
  characterId?: string;
  characterConfirmed: boolean;
  characterTimedOut: boolean;
  selectedCardIds: string[];
  cardsConfirmed: boolean;
  cardsTimedOut: boolean;
  health: number;
  energy: number;
  position: number;
};

export type RoomRecord = {
  id: string;
  status: RoomStatus;
  createdAt: number;
  expiresAt: number;
  players: [PlayerRecord, PlayerRecord?];
  gameState?: GameState;
};

export type RoomStore = Map<string, RoomRecord>;
export type SocketSessionStore = Map<string, PlayerSession>;

const ROOM_TTL_MS = ROOM_EXPIRATION_MINUTES * 60 * 1000;
const ROOM_ID_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomString = (length: number) => {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    const charIndex = Math.floor(Math.random() * ROOM_ID_CHARSET.length);
    value += ROOM_ID_CHARSET[charIndex];
  }

  return value;
};

export const createRoom = (rooms: RoomStore, socketId: string, now: number) => {
  let roomId = randomString(ROOM_ID_LENGTH);

  while (rooms.has(roomId)) {
    roomId = randomString(ROOM_ID_LENGTH);
  }

  const room: RoomRecord = {
    id: roomId,
    status: "waiting",
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    players: [
      {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        role: "host",
        connected: true,
        socketId,
        characterConfirmed: false,
        characterTimedOut: false,
        selectedCardIds: [],
        cardsConfirmed: false,
        cardsTimedOut: false,
        health: 30,
        energy: 5,
        position: 0,
      },
    ],
  };

  rooms.set(room.id, room);
  return room;
};

export const joinRoom = (
  room: RoomRecord,
  socketId: string,
  now: number,
): { ok: true; session: PlayerSession } | { ok: false; code: RoomErrorCode; message: string } => {
  if (room.expiresAt <= now) {
    return {
      ok: false,
      code: "ROOM_EXPIRED",
      message: "This room has expired.",
    };
  }

  if (room.players[1]) {
    return {
      ok: false,
      code: "ROOM_FULL",
      message: "This room already has two players.",
    };
  }

  const guest = {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    role: "guest" as const,
    connected: true,
    socketId,
    characterConfirmed: false,
    characterTimedOut: false,
    selectedCardIds: [],
    cardsConfirmed: false,
    cardsTimedOut: false,
    health: 30,
    energy: 5,
    position: 2,
  };

  room.players[1] = guest;
  room.expiresAt = now + ROOM_TTL_MS;

  return {
    ok: true,
    session: {
      roomId: room.id,
      playerToken: guest.token,
      role: guest.role,
    },
  };
};

export const cleanupExpiredRooms = (rooms: RoomStore, sessions: SocketSessionStore, now: number) => {
  const expiredRoomIds: string[] = [];

  for (const [roomId, room] of rooms) {
    if (room.expiresAt <= now) {
      expiredRoomIds.push(roomId);
    }
  }

  for (const roomId of expiredRoomIds) {
    rooms.delete(roomId);

    for (const [socketId, session] of sessions) {
      if (session.roomId === roomId) {
        sessions.delete(socketId);
      }
    }
  }
};

export const markDisconnected = (rooms: RoomStore, session: PlayerSession | undefined) => {
  if (!session) {
    return;
  }

  const room = rooms.get(session.roomId);

  if (!room) {
    return;
  }

  const player = room.players.find((entry) => entry?.role === session.role);

  if (player) {
    player.connected = false;
  }
};

export const markConnected = (rooms: RoomStore, session: PlayerSession | undefined, socketId: string) => {
  if (!session) {
    return;
  }

  const room = rooms.get(session.roomId);

  if (!room) {
    return;
  }

  const player = room.players.find((entry) => entry?.role === session.role);

  if (player) {
    player.connected = true;
    player.socketId = socketId;
  }
};

export const startCharacterSelect = (room: RoomRecord, now: number, availableCharacterIds: string[]) => {
  room.status = "playing";
  const turnDeadline = now + CHARACTER_SELECT_TIMEOUT_SECONDS * 1000;

  for (const player of room.players) {
    if (!player) {
      continue;
    }
    player.characterId = undefined;
    player.characterConfirmed = false;
    player.characterTimedOut = false;
  }

  room.gameState = {
    phase: "character_select",
    turnDeadline,
    characterSelect: {
      availableCharacters: [],
      selections: room.players
        .filter((player): player is PlayerRecord => Boolean(player))
        .map((player) => ({
          role: player.role,
          characterId: player.characterId,
          confirmed: player.characterConfirmed,
          timedOut: player.characterTimedOut,
        })),
      turnDeadline,
    },
  };

  return {
    turnDeadline,
    fallbackCharacterId: availableCharacterIds[0],
  };
};

export const syncCharacterSelectState = (room: RoomRecord, characters: CharacterSelectState["availableCharacters"]) => {
  if (!room.gameState) {
    return;
  }

  room.gameState.phase = "character_select";
  room.gameState.characterSelect = {
    availableCharacters: characters,
    selections: room.players
      .filter((player): player is PlayerRecord => Boolean(player))
      .map((player) => ({
        role: player.role,
        characterId: player.characterId,
        confirmed: player.characterConfirmed,
        timedOut: player.characterTimedOut,
      })),
    turnDeadline: room.gameState.turnDeadline ?? Date.now(),
  };
};

export const allPlayersConfirmedCharacters = (room: RoomRecord) => {
  return room.players
    .filter((player): player is PlayerRecord => Boolean(player))
    .every((player) => player.characterConfirmed);
};

const toBattlePlayerState = (player: PlayerRecord): BattlePlayerState => ({
  role: player.role,
  characterId: player.characterId,
  health: player.health,
  energy: player.energy,
  position: player.position,
});

export const startCardSelect = (room: RoomRecord, cards: Card[], now: number) => {
  const turnDeadline = now + CARD_SELECT_TIMEOUT_SECONDS * 1000;

  for (const player of room.players) {
    if (!player) {
      continue;
    }

    player.selectedCardIds = [];
    player.cardsConfirmed = false;
    player.cardsTimedOut = false;
  }

  room.gameState = {
    phase: "card_select",
    turnDeadline,
    battleState: {
      round: 1,
      players: room.players
        .filter((player): player is PlayerRecord => Boolean(player))
        .map(toBattlePlayerState),
    },
    cardSelect: {
      availableCards: cards,
      selections: room.players
        .filter((player): player is PlayerRecord => Boolean(player))
        .map((player) => ({
          role: player.role,
          selectedCardIds: player.selectedCardIds,
          confirmed: player.cardsConfirmed,
          timedOut: player.cardsTimedOut,
          totalEnergyCost: 0,
        })),
      round: 1,
      turnDeadline,
    },
  };
};

export const syncCardSelectState = (room: RoomRecord, cards: Card[]) => {
  if (!room.gameState) {
    return;
  }

  room.gameState.phase = "card_select";
  room.gameState.cardSelect = {
    availableCards: cards,
    selections: room.players
      .filter((player): player is PlayerRecord => Boolean(player))
      .map((player) => ({
        role: player.role,
        selectedCardIds: player.selectedCardIds,
        confirmed: player.cardsConfirmed,
        timedOut: player.cardsTimedOut,
        totalEnergyCost: player.selectedCardIds.reduce((sum, cardId) => {
          const card = cards.find((entry) => entry.id === cardId);
          return sum + (card?.energyCost ?? 0);
        }, 0),
      })),
    round: room.gameState.battleState?.round ?? 1,
    turnDeadline: room.gameState.turnDeadline ?? Date.now(),
  };
  room.gameState.battleState = {
    round: room.gameState.battleState?.round ?? 1,
    players: room.players
      .filter((player): player is PlayerRecord => Boolean(player))
      .map(toBattlePlayerState),
  };
};

export const allPlayersConfirmedCards = (room: RoomRecord) => {
  return room.players
    .filter((player): player is PlayerRecord => Boolean(player))
    .every((player) => player.cardsConfirmed);
};

export const toRoomState = (room: RoomRecord): RoomState => {
  return {
    roomId: room.id,
    status: room.status,
    playerCount: room.players.filter(Boolean).length,
    capacity: 2,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    players: room.players
      .filter((player): player is PlayerRecord => Boolean(player))
      .map((player) => ({
        role: player.role,
        connected: player.connected,
      })),
  };
};
