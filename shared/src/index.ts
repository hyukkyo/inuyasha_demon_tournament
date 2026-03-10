export const ROOM_ID_LENGTH = 6;
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
};

export type ClientToServerEvents = {
  ping: (payload: { timestamp: number }) => void;
};

export type ServerToClientEvents = {
  "state:snapshot": (payload: StateSnapshot) => void;
};
