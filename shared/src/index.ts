export const ROOM_ID_LENGTH = 6;
export const ROOM_EXPIRATION_MINUTES = 10;
export const CHARACTER_SELECT_TIMEOUT_SECONDS = 10;
export const CARD_SELECT_TIMEOUT_SECONDS = 30;
export const RECONNECT_TIMEOUT_SECONDS = 30;
export const MAX_ROUNDS = 100;

export type GamePhase =
  | "waiting"
  | "character_select"
  | "card_select"
  | "resolving"
  | "paused_reconnect"
  | "finished";

export type StateSnapshot = {
  serverTime: number;
  phase: GamePhase;
  message: string;
  roomState?: RoomState;
  playerSession?: PlayerSession;
  gameState?: GameState;
};

export type RoomStatus = "waiting" | "playing" | "finished";
export type RoomRole = "host" | "guest";

export type RoomPlayerSummary = {
  role: RoomRole;
  connected: boolean;
};

export type RoomState = {
  roomId: string;
  status: RoomStatus;
  playerCount: number;
  capacity: number;
  createdAt: number;
  expiresAt: number;
  players: RoomPlayerSummary[];
};

export type CharacterArchetype = "swordsman" | "spearman" | "caster" | "archer";

export type Character = {
  id: string;
  name: string;
  archetype: CharacterArchetype;
  summary: string;
};

export type CharacterSelectionPublicState = {
  role: RoomRole;
  characterId?: string;
  confirmed: boolean;
};

export type CharacterSelectionPrivateState = CharacterSelectionPublicState & {
  timedOut: boolean;
};

export type CharacterSelectState = {
  availableCharacters: Character[];
  selections: CharacterSelectionPrivateState[];
  turnDeadline: number;
};

export type GameState = {
  phase: GamePhase;
  turnDeadline?: number;
  characterSelect?: CharacterSelectState;
};

export type PlayerSession = {
  roomId: string;
  playerToken: string;
  role: RoomRole;
};

export type RoomJoinPayload = {
  roomId: string;
  playerToken?: string;
};

export type CharacterSelectPayload = {
  characterId: string;
};

export type RoomEventPayload = {
  roomId: string;
  playerToken: string;
  role: RoomRole;
  roomState: RoomState;
};

export type RoomErrorCode =
  | "ALREADY_IN_ROOM"
  | "INVALID_ROOM_ID"
  | "ROOM_NOT_FOUND"
  | "ROOM_EXPIRED"
  | "ROOM_FULL";

export type RoomErrorPayload = {
  code: RoomErrorCode;
  message: string;
};

export type ClientToServerEvents = {
  ping: (payload: { timestamp: number }) => void;
  "room:create": () => void;
  "room:join": (payload: RoomJoinPayload) => void;
  "character:select": (payload: CharacterSelectPayload) => void;
  "character:confirm": (payload: CharacterSelectPayload) => void;
};

export type ServerToClientEvents = {
  "state:snapshot": (payload: StateSnapshot) => void;
  "room:created": (payload: RoomEventPayload) => void;
  "room:joined": (payload: RoomEventPayload) => void;
  "room:error": (payload: RoomErrorPayload) => void;
  "match:ready": (payload: { gameState: GameState }) => void;
  "character:phase_started": (payload: { remainingSeconds: number; gameState: GameState }) => void;
  "character:opponent_confirmed": (payload: { confirmed: boolean; role: RoomRole }) => void;
};
