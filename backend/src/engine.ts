import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  MAX_ROUNDS,
  type AttackPattern,
  type BattlePlayerState,
  type Card,
  type GameResult,
  type RelativeCell,
  type ResolveEvent,
  type ResolveStep,
  type RoomRole,
} from "@inuyasha/shared";

const MAX_HEALTH = 100;
const MAX_ENERGY = 100;

type PairContext = {
  hostCard: Card;
  guestCard: Card;
  players: BattlePlayerState[];
  stepIndex: number;
};

type Point = {
  x: number;
  y: number;
};

const clonePlayers = (players: BattlePlayerState[]) => players.map((player) => ({ ...player }));

const getPlayer = (players: BattlePlayerState[], role: RoomRole) => {
  const player = players.find((entry) => entry.role === role);

  if (!player) {
    throw new Error(`Missing player state for role: ${role}`);
  }

  return player;
};

const toPoint = (position: number): Point => ({
  x: position % BOARD_WIDTH,
  y: Math.floor(position / BOARD_WIDTH),
});

const toPosition = ({ x, y }: Point) => y * BOARD_WIDTH + x;

const isInsideBoard = ({ x, y }: Point) => x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;

const applyOffset = (origin: Point, offset: RelativeCell): Point => ({
  x: origin.x + offset.dx,
  y: origin.y + offset.dy,
});

const resolvePatternCells = (attacker: BattlePlayerState, pattern?: AttackPattern) => {
  if (!pattern) {
    return new Set<number>();
  }

  const origin = toPoint(attacker.position);
  const positions = pattern.cells
    .map((offset) => applyOffset(origin, offset))
    .filter(isInsideBoard)
    .map(toPosition);

  return new Set(positions);
};

const applyCardCost = (player: BattlePlayerState, card: Card) => {
  player.energy = Math.max(player.energy - card.energyCost, 0);
};

const applyMovement = (
  actor: BattlePlayerState,
  card: Card,
  events: ResolveEvent[],
  logs: string[],
) => {
  if (card.type !== "move") {
    return;
  }

  const nextStep = card.movePattern?.cells[0];

  if (!nextStep) {
    logs.push(`${actor.role} could not move with ${card.name}.`);
    return;
  }

  const target = applyOffset(toPoint(actor.position), nextStep);

  if (!isInsideBoard(target)) {
    logs.push(`${actor.role} could not move with ${card.name}.`);
    return;
  }

  const previous = actor.position;
  actor.position = toPosition(target);
  events.push({
    type: "move",
    role: actor.role,
    cardId: card.id,
    from: previous,
    to: actor.position,
  });
  logs.push(`${actor.role} moved from ${previous} to ${actor.position}.`);
};

const applyRecoveries = (
  player: BattlePlayerState,
  card: Card,
  events: ResolveEvent[],
  logs: string[],
) => {
  if (card.type === "energy_recover") {
    const previous = player.energy;
    player.energy = Math.min(MAX_ENERGY, player.energy + card.energyGain);
    events.push({
      type: "energy_restore",
      role: player.role,
      cardId: card.id,
      amount: player.energy - previous,
      before: previous,
      after: player.energy,
    });
    logs.push(`${player.role} recovered ${player.energy - previous} energy.`);
  }

  if (card.type === "hp_recover") {
    const previous = player.health;
    player.health = Math.min(MAX_HEALTH, player.health + card.healAmount);
    events.push({
      type: "hp_restore",
      role: player.role,
      cardId: card.id,
      amount: player.health - previous,
      before: previous,
      after: player.health,
    });
    logs.push(`${player.role} recovered ${player.health - previous} health.`);
  }
};

const getDefenseValue = (card: Card) => (card.type === "defense" ? card.defenseValue : 0);

const resolveAttackDamage = (
  attacker: BattlePlayerState,
  attackCard: Card,
  defender: BattlePlayerState,
  defenseValue: number,
  events: ResolveEvent[],
  logs: string[],
) => {
  if (attackCard.type !== "attack") {
    return 0;
  }

  const threatenedCells = resolvePatternCells(attacker, attackCard.attackPattern);
  const targetCells = [...threatenedCells].sort((left, right) => left - right);
  const hit = threatenedCells.has(defender.position);
  events.push({
    type: "attack_reveal",
    role: attacker.role,
    cardId: attackCard.id,
    targetCells,
  });

  logs.push(
    `${attacker.role} threatens ${targetCells.join(", ") || "no cells"}.`,
  );

  if (!hit) {
    events.push({
      type: "attack_miss",
      role: attacker.role,
      cardId: attackCard.id,
      targetCells,
    });
    logs.push(`${attacker.role}'s ${attackCard.name} missed.`);
    return 0;
  }

  const damage = Math.max(attackCard.damage - defenseValue, 0);
  events.push({
    type: "attack_hit",
    role: attacker.role,
    cardId: attackCard.id,
    targetRole: defender.role,
    targetCell: defender.position,
    damage,
    blocked: defenseValue,
    beforeHp: defender.health,
    afterHp: Math.max(defender.health - damage, 0),
  });
  logs.push(`${attacker.role}'s ${attackCard.name} hit for ${damage} damage.`);
  return damage;
};

const applyAttack = (
  attacker: BattlePlayerState,
  attackCard: Card,
  defender: BattlePlayerState,
  defenseValue: number,
  events: ResolveEvent[],
  logs: string[],
) => {
  const damage = resolveAttackDamage(attacker, attackCard, defender, defenseValue, events, logs);
  defender.health = Math.max(defender.health - damage, 0);
  if (defender.health <= 0) {
    events.push({
      type: "ko",
      role: defender.role,
    });
  }
  return damage;
};

const resolveNonAttackCard = (
  actor: BattlePlayerState,
  actorCard: Card,
  events: ResolveEvent[],
  logs: string[],
) => {
  if (actorCard.type === "move") {
    applyMovement(actor, actorCard, events, logs);
    return;
  }

  if (actorCard.type === "energy_recover" || actorCard.type === "hp_recover") {
    applyRecoveries(actor, actorCard, events, logs);
    return;
  }

  if (actorCard.type === "defense") {
    events.push({
      type: "guard_ready",
      role: actor.role,
      cardId: actorCard.id,
      value: actorCard.defenseValue,
    });
    logs.push(`${actor.role} prepares ${actorCard.name} for ${actorCard.defenseValue} defense.`);
  }
};

export const resolveCardPair = ({ hostCard, guestCard, players, stepIndex }: PairContext): ResolveStep => {
  const beforeState = clonePlayers(players);
  const nextPlayers = clonePlayers(players);
  const host = getPlayer(nextPlayers, "host");
  const guest = getPlayer(nextPlayers, "guest");
  const events: ResolveEvent[] = [];
  const logs: string[] = [];

  applyCardCost(host, hostCard);
  applyCardCost(guest, guestCard);
  events.push({
    type: "pair_reveal",
    hostCardId: hostCard.id,
    guestCardId: guestCard.id,
  });
  logs.push(`Host used ${hostCard.name}, guest used ${guestCard.name}.`);

  const hostIsAttack = hostCard.type === "attack";
  const guestIsAttack = guestCard.type === "attack";

  if (hostIsAttack && !guestIsAttack) {
    events.push({
      type: "turn_order",
      first: "guest",
      second: "host",
      simultaneous: false,
    });
    resolveNonAttackCard(guest, guestCard, events, logs);
  } else if (!hostIsAttack && guestIsAttack) {
    events.push({
      type: "turn_order",
      first: "host",
      second: "guest",
      simultaneous: false,
    });
    resolveNonAttackCard(host, hostCard, events, logs);
  } else if (!hostIsAttack && !guestIsAttack) {
    events.push({
      type: "turn_order",
      first: "host",
      second: "guest",
      simultaneous: false,
    });
    resolveNonAttackCard(host, hostCard, events, logs);
    resolveNonAttackCard(guest, guestCard, events, logs);
  } else {
    events.push({
      type: "turn_order",
      first: "host",
      second: "guest",
      simultaneous: true,
    });
  }

  const hostDefense = getDefenseValue(hostCard);
  const guestDefense = getDefenseValue(guestCard);

  if (hostIsAttack && guestIsAttack) {
    applyAttack(host, hostCard, guest, guestDefense, events, logs);
    applyAttack(guest, guestCard, host, hostDefense, events, logs);
  } else if (hostIsAttack) {
    applyAttack(host, hostCard, guest, guestDefense, events, logs);
  } else if (guestIsAttack) {
    applyAttack(guest, guestCard, host, hostDefense, events, logs);
  }

  events.push({
    type: "pair_end",
    afterState: clonePlayers(nextPlayers),
  });

  logs.push(
    `After pair ${stepIndex + 1}: host HP ${host.health} EN ${host.energy} POS ${host.position}, guest HP ${guest.health} EN ${guest.energy} POS ${guest.position}.`,
  );

  return {
    stepIndex,
    revealedCards: {
      host: hostCard.id,
      guest: guestCard.id,
    },
    beforeState,
    afterState: nextPlayers,
    events,
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
