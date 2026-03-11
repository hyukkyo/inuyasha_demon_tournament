export const ROOM_ID_LENGTH = 6;
export const ROOM_EXPIRATION_MINUTES = 10;
export const CHARACTER_SELECT_TIMEOUT_SECONDS = 100;
export const CARD_SELECT_TIMEOUT_SECONDS = 300;
export const RECONNECT_TIMEOUT_SECONDS = 300;
export const MAX_ROUNDS = 100;
export const BOARD_WIDTH = 4;
export const BOARD_HEIGHT = 3;
export const BOARD_CELL_COUNT = BOARD_WIDTH * BOARD_HEIGHT;
export const ATTACK_PATTERN_RADIUS = 3;

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

export type CardId = string;
export type CharacterId = string;

export type BoardPosition = number;

export type RelativeCell = {
  dx: number;
  dy: number;
};

export type AttackPattern = {
  radius: number;
  cells: RelativeCell[];
};

export type MovePattern = {
  cells: RelativeCell[];
};

export type CardScope = "common" | "signature";

export type CharacterCardPreview = {
  cardId: CardId;
  name: string;
  summary: string;
};

export type Character = {
  id: CharacterId;
  name: string;
  archetype: CharacterArchetype;
  summary: string;
  signatureCardIds: CardId[];
  signatureCards: CharacterCardPreview[];
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

export type CardType = "move" | "attack" | "defense" | "energy_recover" | "hp_recover";

export type Card = {
  id: CardId;
  name: string;
  type: CardType;
  scope: CardScope;
  ownerCharacterId?: CharacterId;
  energyCost: number;
  energyGain: number;
  damage: number;
  defenseValue: number;
  healAmount: number;
  summary: string;
  movePattern?: MovePattern;
  attackPattern?: AttackPattern;
};

export type BattlePlayerState = {
  role: RoomRole;
  characterId?: CharacterId;
  health: number;
  energy: number;
  position: BoardPosition;
};

export type CardSelectionState = {
  role: RoomRole;
  selectedCardIds: string[];
  confirmed: boolean;
  timedOut: boolean;
  totalEnergyCost: number;
};

export type CardSelectState = {
  availableCards: Card[];
  commonCards: Card[];
  signatureCardsByRole: Partial<Record<RoomRole, Card[]>>;
  selections: CardSelectionState[];
  round: number;
  turnDeadline: number;
};

export type ResolveEvent =
  | {
      type: "pair_reveal";
      hostCardId: CardId;
      guestCardId: CardId;
    }
  | {
      type: "turn_order";
      first: RoomRole;
      second: RoomRole;
      simultaneous: boolean;
    }
  | {
      type: "move";
      role: RoomRole;
      cardId: CardId;
      from: BoardPosition;
      to: BoardPosition;
    }
  | {
      type: "guard_ready";
      role: RoomRole;
      cardId: CardId;
      value: number;
    }
  | {
      type: "energy_restore";
      role: RoomRole;
      cardId: CardId;
      amount: number;
      before: number;
      after: number;
    }
  | {
      type: "hp_restore";
      role: RoomRole;
      cardId: CardId;
      amount: number;
      before: number;
      after: number;
    }
  | {
      type: "attack_reveal";
      role: RoomRole;
      cardId: CardId;
      targetCells: BoardPosition[];
    }
  | {
      type: "attack_hit";
      role: RoomRole;
      cardId: CardId;
      targetRole: RoomRole;
      targetCell: BoardPosition;
      damage: number;
      blocked: number;
      beforeHp: number;
      afterHp: number;
    }
  | {
      type: "attack_miss";
      role: RoomRole;
      cardId: CardId;
      targetCells: BoardPosition[];
    }
  | {
      type: "ko";
      role: RoomRole;
    }
  | {
      type: "pair_end";
      afterState: BattlePlayerState[];
    };

export type ResolveStep = {
  stepIndex: number;
  revealedCards: Record<RoomRole, string>;
  beforeState: BattlePlayerState[];
  afterState: BattlePlayerState[];
  events: ResolveEvent[];
  logs: string[];
};

export type GameResult = {
  winnerRole?: RoomRole;
  reason: string;
  outcome: "win" | "draw";
};

export type GameState = {
  phase: GamePhase;
  turnDeadline?: number;
  pausedState?: "character_select" | "card_select" | "resolving";
  pausedRemainingMs?: number;
  reconnectDeadline?: number;
  disconnectedPlayerRole?: RoomRole;
  characterSelect?: CharacterSelectState;
  cardSelect?: CardSelectState;
  battleState?: {
    round: number;
    players: BattlePlayerState[];
  };
  resolveSteps?: ResolveStep[];
  result?: GameResult;
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

export type RoomReconnectPayload = {
  roomId: string;
  playerToken: string;
};

export type CharacterSelectPayload = {
  characterId: string;
};

export type CardsPayload = {
  selectedCardIds: string[];
};

export type LeavePayload = {
  roomId: string;
  playerToken: string;
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
  "room:reconnect": (payload: RoomReconnectPayload) => void;
  "game:leave": (payload: LeavePayload) => void;
  "character:select": (payload: CharacterSelectPayload) => void;
  "character:confirm": (payload: CharacterSelectPayload) => void;
  "cards:update": (payload: CardsPayload) => void;
  "cards:confirm": (payload: CardsPayload) => void;
};

export type ServerToClientEvents = {
  "state:snapshot": (payload: StateSnapshot) => void;
  "room:created": (payload: RoomEventPayload) => void;
  "room:joined": (payload: RoomEventPayload) => void;
  "room:error": (payload: RoomErrorPayload) => void;
  "match:ready": (payload: { gameState: GameState }) => void;
  "character:phase_started": (payload: { remainingSeconds: number; gameState: GameState }) => void;
  "character:opponent_confirmed": (payload: { confirmed: boolean; role: RoomRole }) => void;
  "cards:phase_started": (payload: { remainingSeconds: number; gameState: GameState }) => void;
  "cards:opponent_confirmed": (payload: { confirmed: boolean; role: RoomRole }) => void;
  "resolve:step": (payload: ResolveStep) => void;
  "game:paused_reconnect": (payload: {
    disconnectedPlayerRole: RoomRole;
    remainingReconnectSeconds: number;
  }) => void;
  "game:resumed": (payload: { gameState: GameState; remainingSeconds: number }) => void;
  "game:finished": (payload: GameResult) => void;
};
