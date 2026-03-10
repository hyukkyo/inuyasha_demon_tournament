import { MAX_ROUNDS, type BattlePlayerState, type Card, type GameResult, type ResolveStep } from "@inuyasha/shared";

const MAX_HEALTH = 30;
const MAX_ENERGY = 10;
const MIN_POSITION = 0;
const MAX_POSITION = 4;

type PairContext = {
  hostCard: Card;
  guestCard: Card;
  players: BattlePlayerState[];
  stepIndex: number;
};

const clonePlayers = (players: BattlePlayerState[]) => players.map((player) => ({ ...player }));

const getPlayer = (players: BattlePlayerState[], role: "host" | "guest") => {
  const player = players.find((entry) => entry.role === role);

  if (!player) {
    throw new Error(`Missing player state for role: ${role}`);
  }

  return player;
};

const applyCardCost = (player: BattlePlayerState, card: Card) => {
  player.energy = Math.max(player.energy - card.energyCost, 0);
};

const applyMovement = (player: BattlePlayerState, card: Card) => {
  if (card.type !== "move") {
    return;
  }

  const delta =
    card.id === "step_forward" ? (player.role === "host" ? 1 : -1) : player.role === "host" ? -1 : 1;

  player.position = Math.min(MAX_POSITION, Math.max(MIN_POSITION, player.position + delta));
};

const applyRecoveries = (player: BattlePlayerState, card: Card) => {
  if (card.type === "energy_recover") {
    player.energy = Math.min(MAX_ENERGY, player.energy + card.energyGain);
  }

  if (card.type === "hp_recover") {
    player.health = Math.min(MAX_HEALTH, player.health + 3);
  }
};

const resolveDamage = (
  attacker: BattlePlayerState,
  attackCard: Card,
  defender: BattlePlayerState,
  defenseCard: Card,
) => {
  if (attackCard.type !== "attack") {
    return 0;
  }

  const distance = Math.abs(attacker.position - defender.position);

  if (distance > 1) {
    return 0;
  }

  const blocked = defenseCard.type === "defense" ? defenseCard.defenseValue : 0;
  return Math.max(attackCard.damage - blocked, 0);
};

export const resolveCardPair = ({ hostCard, guestCard, players, stepIndex }: PairContext): ResolveStep => {
  const beforeState = clonePlayers(players);
  const nextPlayers = clonePlayers(players);
  const host = getPlayer(nextPlayers, "host");
  const guest = getPlayer(nextPlayers, "guest");
  const logs: string[] = [];

  applyCardCost(host, hostCard);
  applyCardCost(guest, guestCard);
  logs.push(`Host used ${hostCard.name}, guest used ${guestCard.name}.`);

  applyMovement(host, hostCard);
  applyMovement(guest, guestCard);

  if (hostCard.type === "move" || guestCard.type === "move") {
    logs.push(`Positions changed to host:${host.position}, guest:${guest.position}.`);
  }

  const damageToGuest = resolveDamage(host, hostCard, guest, guestCard);
  const damageToHost = resolveDamage(guest, guestCard, host, hostCard);

  if (damageToGuest > 0) {
    guest.health = Math.max(guest.health - damageToGuest, 0);
    logs.push(`Host dealt ${damageToGuest} damage to guest.`);
  }

  if (damageToHost > 0) {
    host.health = Math.max(host.health - damageToHost, 0);
    logs.push(`Guest dealt ${damageToHost} damage to host.`);
  }

  applyRecoveries(host, hostCard);
  applyRecoveries(guest, guestCard);

  if (hostCard.type === "energy_recover" || guestCard.type === "energy_recover") {
    logs.push(`Energy changed to host:${host.energy}, guest:${guest.energy}.`);
  }

  if (hostCard.type === "hp_recover" || guestCard.type === "hp_recover") {
    logs.push(`Health changed to host:${host.health}, guest:${guest.health}.`);
  }

  return {
    stepIndex,
    revealedCards: {
      host: hostCard.id,
      guest: guestCard.id,
    },
    beforeState,
    afterState: nextPlayers,
    logs,
  };
};

export const checkGameEnd = (players: BattlePlayerState[], round: number): GameResult | undefined => {
  const host = getPlayer(players, "host");
  const guest = getPlayer(players, "guest");

  if (host.health <= 0 && guest.health <= 0) {
    return {
      outcome: "draw",
      reason: "Both players were defeated in the same exchange.",
    };
  }

  if (host.health <= 0) {
    return {
      outcome: "win",
      winnerRole: "guest",
      reason: "Guest reduced host health to 0.",
    };
  }

  if (guest.health <= 0) {
    return {
      outcome: "win",
      winnerRole: "host",
      reason: "Host reduced guest health to 0.",
    };
  }

  if (round >= MAX_ROUNDS) {
    return {
      outcome: "draw",
      reason: "Reached the maximum round limit.",
    };
  }

  return undefined;
};
