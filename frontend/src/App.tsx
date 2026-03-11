import { useEffect, useState } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type AttackPattern,
  type BattlePlayerState,
  type Card,
  type Character,
  type GamePhase,
  type ResolveStep,
  type RoomRole,
} from "@inuyasha/shared";
import { readPersistedSession, serverUrl, useGameStore } from "./store/gameStore";

const formatPhase = (phase?: GamePhase) => {
  switch (phase) {
    case "character_select":
      return "Character Select";
    case "card_select":
      return "Card Select";
    case "resolving":
      return "Resolving";
    case "paused_reconnect":
      return "Paused";
    case "finished":
      return "Result";
    default:
      return "Waiting";
  }
};

const formatRole = (role?: "host" | "guest") => (role ? role.toUpperCase() : "-");

const formatPositionLabel = (position?: number) => {
  if (position === undefined) {
    return "-";
  }

  const x = (position % BOARD_WIDTH) + 1;
  const y = Math.floor(position / BOARD_WIDTH) + 1;
  return `R${y} C${x}`;
};

const formatPattern = (pattern?: AttackPattern) => {
  if (!pattern?.cells.length) {
    return "Pattern -";
  }

  return pattern.cells
    .map((cell) => `${cell.dx >= 0 ? "+" : ""}${cell.dx},${cell.dy >= 0 ? "+" : ""}${cell.dy}`)
    .join("  ");
};

const describeResolveEvent = (event?: ResolveStep["events"][number]) => {
  if (!event) {
    return "Waiting for event";
  }

  switch (event.type) {
    case "pair_reveal":
      return `Reveal ${event.hostCardId} vs ${event.guestCardId}`;
    case "turn_order":
      return event.simultaneous
        ? `Both attacks resolve in order: ${event.first} then ${event.second}`
        : `${event.first} acts before ${event.second}`;
    case "move":
      return `${event.role} moves ${formatPositionLabel(event.from)} -> ${formatPositionLabel(event.to)}`;
    case "guard_ready":
      return `${event.role} prepares guard ${event.value}`;
    case "energy_restore":
      return `${event.role} restores ${event.amount} EN`;
    case "hp_restore":
      return `${event.role} restores ${event.amount} HP`;
    case "attack_reveal":
      return `${event.role} reveals attack on ${event.targetCells.join(", ") || "-"}`;
    case "attack_hit":
      return `${event.role} hits ${event.targetRole} for ${event.damage}`;
    case "attack_miss":
      return `${event.role} misses`;
    case "ko":
      return `${event.role} is knocked out`;
    case "pair_end":
      return "Pair resolved";
    default:
      return "Resolving";
  }
};

const buildEnergyTimeline = (cards: Card[], baseEnergy: number) => {
  let energy = baseEnergy;

  return cards.map((card) => {
    const before = energy;
    const playable = card.energyCost <= before;
    energy = Math.max(before - card.energyCost, 0);

    if (card.type === "energy_recover") {
      energy += card.energyGain;
    }

    return {
      cardId: card.id,
      before,
      after: energy,
      playable,
    };
  });
};

const BoardTrack = ({
  players,
  label = "Board State",
  emphasizePositions,
}: {
  players?: BattlePlayerState[];
  label?: string;
  emphasizePositions?: number[];
}) => {
  const livePlayers = useGameStore((state) => state.gameState?.battleState?.players);
  const sourcePlayers = players ?? livePlayers;
  const cells = Array.from({ length: BOARD_WIDTH * BOARD_HEIGHT }, (_, index) => index);
  const highlighted = new Set(emphasizePositions ?? []);

  return (
    <section className="board-panel">
      <div className="board-heading">
        <p className="kicker">{label}</p>
        <span className="board-caption">
          {BOARD_WIDTH} x {BOARD_HEIGHT} Arena
        </span>
      </div>
      <div
        className="board-track"
        style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, minmax(0, 1fr))` }}
      >
        {cells.map((cell) => {
          const occupants = sourcePlayers?.filter((player) => player.position === cell) ?? [];

          return (
            <div key={cell} className={`board-cell${highlighted.has(cell) ? " is-highlighted" : ""}`}>
              <span className="board-index">{formatPositionLabel(cell)}</span>
              <div className={`board-occupants count-${occupants.length}`}>
                {occupants.map((player) => (
                  <div key={player.role} className={`piece piece-${player.role}`}>
                    <strong>{player.role === "host" ? "H" : "G"}</strong>
                    <small>{player.characterId ?? player.role}</small>
                    <small>HP {player.health}</small>
                    <small>EN {player.energy}</small>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const useCountdown = (deadline?: number) => {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) {
      setSeconds(null);
      return;
    }

    const update = () => {
      setSeconds(Math.max(Math.ceil((deadline - Date.now()) / 1000), 0));
    };

    update();
    const interval = window.setInterval(update, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [deadline]);

  return seconds;
};
const BattleStatusStrip = () => {
  const battleState = useGameStore((state) => state.gameState?.battleState);
  const playerSession = useGameStore((state) => state.playerSession);
  const me = battleState?.players.find((player) => player.role === playerSession?.role);
  const opponent = battleState?.players.find((player) => player.role !== playerSession?.role);

  if (!battleState || !me || !opponent) {
    return null;
  }

  return (
    <section className="hud-strip">
      <article className="hud-card is-self">
        <p className="kicker">My Status</p>
        <strong>{formatRole(me.role)}</strong>
        <dl className="mini-stats">
          <div><dt>HP</dt><dd>{me.health}</dd></div>
          <div><dt>EN</dt><dd>{me.energy}</dd></div>
          <div><dt>POS</dt><dd>{formatPositionLabel(me.position)}</dd></div>
        </dl>
      </article>
      <article className="hud-card center">
        <p className="kicker">Round</p>
        <strong>{battleState.round}</strong>
      </article>
      <article className="hud-card is-foe">
        <p className="kicker">Opponent</p>
        <strong>{formatRole(opponent.role)}</strong>
        <dl className="mini-stats">
          <div><dt>HP</dt><dd>{opponent.health}</dd></div>
          <div><dt>EN</dt><dd>{opponent.energy}</dd></div>
          <div><dt>POS</dt><dd>{formatPositionLabel(opponent.position)}</dd></div>
        </dl>
      </article>
    </section>
  );
};

const ResolveDelta = ({
  role,
  before,
  after,
}: {
  role: RoomRole;
  before?: BattlePlayerState;
  after?: BattlePlayerState;
}) => {
  if (!before || !after) {
    return null;
  }

  const hpDelta = after.health - before.health;
  const energyDelta = after.energy - before.energy;
  const moved = before.position !== after.position;

  return (
    <article className={`status-card delta-card delta-${role}`}>
      <p className="kicker">{formatRole(role)}</p>
      <dl className="detail-grid">
        <div><dt>HP</dt><dd>{before.health} {"->"} {after.health} ({hpDelta >= 0 ? "+" : ""}{hpDelta})</dd></div>
        <div><dt>EN</dt><dd>{before.energy} {"->"} {after.energy} ({energyDelta >= 0 ? "+" : ""}{energyDelta})</dd></div>
        <div><dt>Move</dt><dd>{formatPositionLabel(before.position)} {"->"} {formatPositionLabel(after.position)}</dd></div>
        <div><dt>Status</dt><dd>{moved ? "Moved" : "Held"}</dd></div>
      </dl>
    </article>
  );
};

const CardPanel = ({
  card,
  active,
  blocked,
  disabled,
  onClick,
  energyHint,
}: {
  card: Card;
  active?: boolean;
  blocked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  energyHint?: string;
}) => (
  <button
    className={`card-option game${active ? " is-active" : ""}${blocked ? " is-blocked" : ""}${card.scope === "signature" ? " is-signature" : ""}`}
    onClick={onClick}
    disabled={disabled}
  >
    <p className="kicker">{card.scope === "signature" ? "signature" : card.type}</p>
    <strong>{card.name}</strong>
    <small>{card.summary}</small>
    <div className="slot-meta">
      <span>Cost {card.energyCost}</span>
      {card.energyGain > 0 ? <span>Gain {card.energyGain}</span> : null}
      {card.damage > 0 ? <span>DMG {card.damage}</span> : null}
      {card.defenseValue > 0 ? <span>DEF {card.defenseValue}</span> : null}
      {card.healAmount > 0 ? <span>Heal {card.healAmount}</span> : null}
    </div>
    {card.attackPattern ? <p className="pattern-line">{formatPattern(card.attackPattern)}</p> : null}
    {energyHint ? <span className="card-hint">{energyHint}</span> : null}
  </button>
);

const HeaderBar = ({ title, subtitle }: { title: string; subtitle: string }) => {
  const connected = useGameStore((state) => state.connected);
  const roomState = useGameStore((state) => state.roomState);
  const playerSession = useGameStore((state) => state.playerSession);
  const gameState = useGameStore((state) => state.gameState);

  return (
    <header className="game-header">
      <div>
        <p className="kicker">Inuyasha Demon Tournament</p>
        <h1>{title}</h1>
        <p className="lede">{subtitle}</p>
      </div>
      <dl className="topline">
        <div>
          <dt>Room</dt>
          <dd>{roomState?.roomId ?? "------"}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{formatRole(playerSession?.role)}</dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd>{formatPhase(gameState?.phase)}</dd>
        </div>
        <div>
          <dt>Socket</dt>
          <dd>{connected ? "CONNECTED" : "OFFLINE"}</dd>
        </div>
      </dl>
    </header>
  );
};

const ErrorBanner = () => {
  const roomError = useGameStore((state) => state.roomError);
  const clearError = useGameStore((state) => state.clearError);

  if (!roomError) {
    return null;
  }

  return (
    <section className="error-banner">
      <div>
        <strong>{roomError.code}</strong>
        <p>{roomError.message}</p>
      </div>
      <button className="ghost" onClick={clearError}>
        Dismiss
      </button>
    </section>
  );
};

const PauseModal = () => {
  const gameState = useGameStore((state) => state.gameState);
  const reconnectRoom = useGameStore((state) => state.reconnectRoom);
  const session = useGameStore((state) => state.playerSession) ?? readPersistedSession();
  const reconnectSeconds = useCountdown(gameState?.reconnectDeadline);

  if (gameState?.phase !== "paused_reconnect") {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <p className="kicker">Reconnect Pause</p>
        <h2>Game is temporarily paused</h2>
        <p className="lede">
          {gameState.disconnectedPlayerRole === session?.role
            ? "You were disconnected. Reconnect to continue from the same point."
            : "Your opponent is reconnecting. The match will resume automatically."}
        </p>
        <dl className="detail-grid">
          <div>
            <dt>Paused Phase</dt>
            <dd>{formatPhase(gameState.pausedState)}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{reconnectSeconds ?? "-"}s</dd>
          </div>
        </dl>
        {gameState.disconnectedPlayerRole === session?.role && session ? (
          <div className="actions compact">
            <button onClick={() => reconnectRoom(session.roomId, session.playerToken)}>
              Restore Session
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const HomeScreen = () => {
  const createRoom = useGameStore((state) => state.createRoom);
  const joinRoom = useGameStore((state) => state.joinRoom);
  const connected = useGameStore((state) => state.connected);
  const reconnectRoom = useGameStore((state) => state.reconnectRoom);
  const [roomIdInput, setRoomIdInput] = useState("");
  const persisted = readPersistedSession();

  return (
    <section className="screen screen-home">
      <HeaderBar
        title="Create or Join a Duel Room"
        subtitle="Spin up a private room, share the code, and move into the match flow."
      />
      <ErrorBanner />
      <div className="home-grid">
        <article className="hero-card">
          <p className="kicker">Host Match</p>
          <h2>Open a room for a two-player duel</h2>
          <p>Create a room, copy the code, then wait for your opponent to enter.</p>
          <button onClick={createRoom} disabled={!connected}>
            Create Room
          </button>
        </article>
        <article className="hero-card muted">
          <p className="kicker">Join Match</p>
          <h2>Enter a room code</h2>
          <label className="field">
            <span>Room Code</span>
            <input
              value={roomIdInput}
              onChange={(event) =>
                setRoomIdInput(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
                )
              }
              placeholder="ABC123"
            />
          </label>
          <div className="actions">
            <button onClick={() => joinRoom(roomIdInput)} disabled={!connected || roomIdInput.length !== 6}>
              Join Room
            </button>
            {persisted ? (
              <button
                className="ghost"
                onClick={() => reconnectRoom(persisted.roomId, persisted.playerToken)}
                disabled={!connected}
              >
                Restore Session
              </button>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
};

const WaitingScreen = () => {
  const roomState = useGameStore((state) => state.roomState);
  const playerSession = useGameStore((state) => state.playerSession);
  const leaveGame = useGameStore((state) => state.leaveGame);
  const expiresIn = useCountdown(roomState?.expiresAt);

  if (!roomState || !playerSession) {
    return null;
  }

  return (
    <section className="screen">
      <HeaderBar
        title="Waiting for Opponent"
        subtitle="Share the room code. Character select starts as soon as the second player joins."
      />
      <ErrorBanner />
      <div className="waiting-layout">
        <article className="room-code-card">
          <p className="kicker">Room Code</p>
          <h2>{roomState.roomId}</h2>
          <p>Send this code to your opponent so they can join the duel.</p>
        </article>
        <article className="status-card">
          <dl className="detail-grid">
            <div>
              <dt>Players</dt>
              <dd>
                {roomState.playerCount}/{roomState.capacity}
              </dd>
            </div>
            <div>
              <dt>Expires In</dt>
              <dd>{expiresIn ?? "-"}s</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{formatRole(playerSession.role)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{roomState.status}</dd>
            </div>
          </dl>
          <div className="actions">
            <button className="ghost" onClick={() => leaveGame(playerSession.roomId, playerSession.playerToken)}>
              Leave Room
            </button>
          </div>
        </article>
      </div>
    </section>
  );
};

const CharacterSelectScreen = () => {
  const gameState = useGameStore((state) => state.gameState);
  const playerSession = useGameStore((state) => state.playerSession);
  const opponentConfirmedRole = useGameStore((state) => state.opponentConfirmedRole);
  const selectCharacter = useGameStore((state) => state.selectCharacter);
  const confirmCharacter = useGameStore((state) => state.confirmCharacter);
  const remainingSeconds = useCountdown(gameState?.turnDeadline);
  const characterSelect = gameState?.characterSelect;
  const mySelection = characterSelect?.selections.find((item) => item.role === playerSession?.role);
  const opponentSelection = characterSelect?.selections.find((item) => item.role !== playerSession?.role);

  if (!characterSelect) {
    return null;
  }

  return (
    <section className="screen">
      <HeaderBar
        title="Choose Your Fighter"
        subtitle="Lock in one character. Opponent details stay hidden until the phase is complete."
      />
      <ErrorBanner />
      <div className="section-topline">
        <span className={`countdown ${remainingSeconds !== null && remainingSeconds <= 3 ? "warning" : ""}`}>
          {remainingSeconds ?? "-"}s
        </span>
        <span className="indicator">
          Opponent confirmed:{" "}
          {opponentSelection?.confirmed || opponentConfirmedRole === opponentSelection?.role ? "Yes" : "No"}
        </span>
      </div>
      <div className="character-grid">
        {characterSelect.availableCharacters.map((character: Character) => {
          const active = mySelection?.characterId === character.id;

          return (
            <button
              key={character.id}
              className={`character-card large${active ? " is-active" : ""}`}
              onClick={() => selectCharacter(character.id)}
              disabled={mySelection?.confirmed}
            >
              <p className="kicker">{character.archetype}</p>
              <strong>{character.name}</strong>
              <small>{character.summary}</small>
              <div className="slot-meta">
                {character.signatureCards.map((card) => (
                  <span key={card.cardId}>{card.name}</span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="action-strip">
        <div>
          <p className="label">Selected</p>
          <strong>{mySelection?.characterId ?? "No character selected"}</strong>
        </div>
        <button
          onClick={() => mySelection?.characterId && confirmCharacter(mySelection.characterId)}
          disabled={!mySelection?.characterId || mySelection.confirmed}
        >
          Confirm Character
        </button>
      </div>
      <BoardTrack label="Arena Preview" />
    </section>
  );
};

const CardSelectScreen = () => {
  const gameState = useGameStore((state) => state.gameState);
  const playerSession = useGameStore((state) => state.playerSession);
  const opponentCardsConfirmedRole = useGameStore((state) => state.opponentCardsConfirmedRole);
  const updateCards = useGameStore((state) => state.updateCards);
  const confirmCards = useGameStore((state) => state.confirmCards);
  const remainingSeconds = useCountdown(gameState?.turnDeadline);
  const cardSelect = gameState?.cardSelect;
  const battleState = gameState?.battleState;
  const mySelection = cardSelect?.selections.find((item) => item.role === playerSession?.role);
  const opponentSelection = cardSelect?.selections.find((item) => item.role !== playerSession?.role);
  const myBattle = battleState?.players.find((item) => item.role === playerSession?.role);

  if (!cardSelect || !mySelection) {
    return null;
  }

  const myCards = mySelection.selectedCardIds
    .map((cardId) => cardSelect.availableCards.find((item) => item.id === cardId))
    .filter((card): card is Card => Boolean(card));
  const energyTimeline = buildEnergyTimeline(myCards, myBattle?.energy ?? 0);
  const commonCards = cardSelect.commonCards;
  const signatureCards = cardSelect.signatureCardsByRole[playerSession?.role ?? "host"] ?? [];

  const toggleCard = (card: Card) => {
    const current = mySelection.selectedCardIds;

    if (current.includes(card.id)) {
      updateCards(current.filter((item) => item !== card.id));
      return;
    }

    if (current.length >= 3) {
      return;
    }

    updateCards([...current, card.id]);
  };

  const moveCard = (index: number, direction: -1 | 1) => {
    const current = [...mySelection.selectedCardIds];
    const next = index + direction;

    if (next < 0 || next >= current.length) {
      return;
    }

    [current[index], current[next]] = [current[next], current[index]];
    updateCards(current);
  };

  return (
    <section className="screen">
      <HeaderBar
        title={`Round ${cardSelect.round} Card Select`}
        subtitle="Choose three cards in order. The opponent only sees whether you have locked in."
      />
      <ErrorBanner />
      <div className="section-topline">
        <span className={`countdown ${remainingSeconds !== null && remainingSeconds <= 5 ? "warning" : ""}`}>
          {remainingSeconds ?? "-"}s
        </span>
        <span className="indicator">
          Opponent confirmed:{" "}
          {opponentSelection?.confirmed || opponentCardsConfirmedRole === opponentSelection?.role ? "Yes" : "No"}
        </span>
      </div>
      <BattleStatusStrip />
      <BoardTrack label="Current Positions" />
      <div className="selection-layout">
        <section className="slots-panel">
          <div className="slots-header">
            <div>
              <p className="kicker">Selection Queue</p>
              <h2>Three-card sequence</h2>
            </div>
            <button onClick={() => confirmCards(mySelection.selectedCardIds)} disabled={mySelection.selectedCardIds.length !== 3 || mySelection.confirmed}>
              Confirm Cards
            </button>
          </div>
          <div className="slots-grid">
            {[0, 1, 2].map((slotIndex) => {
              const cardId = mySelection.selectedCardIds[slotIndex];
              const card = cardSelect.availableCards.find((item) => item.id === cardId);
              const energyStep = card ? energyTimeline.find((entry) => entry.cardId === card.id) : undefined;

              return (
                <article key={slotIndex} className="slot-card">
                  <p className="kicker">Slot {slotIndex + 1}</p>
                  <strong>{card?.name ?? "Empty"}</strong>
                  <small>{card?.summary ?? "Choose a card from the deck below."}</small>
                  <div className="slot-meta">
                    <span>{card?.type ?? "pending"}</span>
                    <span>Cost {card?.energyCost ?? 0}</span>
                    {energyStep ? <span>{energyStep.before} {"->"} {energyStep.after}</span> : null}
                  </div>
                  {card ? (
                    <div className="actions compact">
                      <button className="ghost" onClick={() => moveCard(slotIndex, -1)} disabled={mySelection.confirmed}>
                        Left
                      </button>
                      <button className="ghost" onClick={() => moveCard(slotIndex, 1)} disabled={mySelection.confirmed}>
                        Right
                      </button>
                      <button
                        className="ghost"
                        onClick={() => updateCards(mySelection.selectedCardIds.filter((item) => item !== card.id))}
                        disabled={mySelection.confirmed}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
        <aside className="deck-side-panel">
          <article className="status-card accent">
            <p className="kicker">Energy Preview</p>
            <h2>{mySelection.totalEnergyCost} / {myBattle?.energy ?? "-"}</h2>
            <p className="empty-state">Server validates step order, but this preview follows slot sequence.</p>
          </article>
          <article className="status-card">
            <p className="kicker">Opponent Lock-in</p>
            <h2>{opponentSelection?.confirmed ? "Ready" : "Pending"}</h2>
            <p className="empty-state">Only confirmation state is visible in this phase.</p>
          </article>
        </aside>
      </div>
      <section className="deck-section">
        <div className="deck-heading">
          <div>
            <p className="kicker">Common Deck</p>
            <h2>Shared techniques</h2>
          </div>
        </div>
        <div className="card-grid large">
          {commonCards.map((card) => {
            const active = mySelection.selectedCardIds.includes(card.id);
            const blocked = !active && card.energyCost > (myBattle?.energy ?? 0);

            return (
              <CardPanel
                key={card.id}
                card={card}
                active={active}
                blocked={blocked}
                disabled={mySelection.confirmed || (!active && mySelection.selectedCardIds.length >= 3)}
                onClick={() => toggleCard(card)}
                energyHint={blocked ? "Base energy short" : "Available"}
              />
            );
          })}
        </div>
      </section>
      <section className="deck-section">
        <div className="deck-heading">
          <div>
            <p className="kicker">Signature Deck</p>
            <h2>Character techniques</h2>
          </div>
        </div>
        <div className="card-grid large">
          {signatureCards.map((card) => {
            const active = mySelection.selectedCardIds.includes(card.id);
            const blocked = !active && card.energyCost > (myBattle?.energy ?? 0);

            return (
              <CardPanel
                key={card.id}
                card={card}
                active={active}
                blocked={blocked}
                disabled={mySelection.confirmed || (!active && mySelection.selectedCardIds.length >= 3)}
                onClick={() => toggleCard(card)}
                energyHint={blocked ? "Base energy short" : "Signature"}
              />
            );
          })}
        </div>
      </section>
    </section>
  );
};

const ResolvingScreen = () => {
  const gameState = useGameStore((state) => state.gameState);
  const resolveQueue = useGameStore((state) => state.resolveQueue);
  const activeResolveStep = useGameStore((state) => state.activeResolveStep);
  const activeResolveEventIndex = useGameStore((state) => state.activeResolveEventIndex);
  const resetResolvePlayback = useGameStore((state) => state.resetResolvePlayback);
  const advanceResolvePlayback = useGameStore((state) => state.advanceResolvePlayback);
  const round = gameState?.battleState?.round ?? 1;
  const steps = resolveQueue.length ? resolveQueue : gameState?.resolveSteps ?? [];
  const currentStep = activeResolveStep ?? steps.at(-1);
  const currentEvent = currentStep?.events[activeResolveEventIndex];
  const beforeHost = currentStep?.beforeState.find((player) => player.role === "host");
  const beforeGuest = currentStep?.beforeState.find((player) => player.role === "guest");
  const afterHost = currentStep?.afterState.find((player) => player.role === "host");
  const afterGuest = currentStep?.afterState.find((player) => player.role === "guest");
  const lastPairEndIndex = currentStep?.events.findIndex((event) => event.type === "pair_end") ?? -1;
  const shouldShowAfter =
    currentEvent?.type === "pair_end" || (lastPairEndIndex >= 0 && activeResolveEventIndex > lastPairEndIndex);
  const playbackState = currentStep ? (shouldShowAfter ? currentStep.afterState : currentStep.beforeState) : undefined;
  const changedPositions =
    currentStep
      ? [
          beforeHost?.position,
          beforeGuest?.position,
          afterHost?.position,
          afterGuest?.position,
        ].filter((value): value is number => value !== undefined)
      : undefined;

  useEffect(() => {
    if (!steps.length) {
      return;
    }

    if (!activeResolveStep) {
      resetResolvePlayback();
    }
  }, [activeResolveStep, resetResolvePlayback, steps.length]);

  useEffect(() => {
    if (!currentStep || !currentEvent) {
      return;
    }

    const timeout = window.setTimeout(() => {
      advanceResolvePlayback();
    }, currentEvent.type === "pair_reveal" || currentEvent.type === "turn_order" ? 700 : 900);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeResolveEventIndex, advanceResolvePlayback, currentEvent, currentStep]);

  return (
    <section className="screen">
      <HeaderBar
        title={`Resolving Round ${round}`}
        subtitle="Cards are revealed pair by pair. Watch the board shift before the next selection phase."
      />
      <ErrorBanner />
      <BoardTrack
        players={playbackState}
        label="Playback Board"
        emphasizePositions={changedPositions}
      />
      <BoardTrack
        players={currentStep?.afterState}
        label="After Resolve"
        emphasizePositions={changedPositions}
      />
      <BattleStatusStrip />
      <section className="resolve-layout">
        <article className="status-card accent">
          <p className="kicker">Current Reveal</p>
          {currentStep ? (
            <>
              <h2>Pair {currentStep.stepIndex + 1}</h2>
              <div className="vs-banner">
                <span>{currentStep.revealedCards.host}</span>
                  <strong>VS</strong>
                  <span>{currentStep.revealedCards.guest}</span>
                </div>
              <p className="event-callout">{describeResolveEvent(currentEvent)}</p>
              <div className="resolve-deltas">
                <ResolveDelta role="host" before={beforeHost} after={afterHost} />
                <ResolveDelta role="guest" before={beforeGuest} after={afterGuest} />
              </div>
            </>
          ) : (
            <p className="empty-state">Waiting for the first reveal.</p>
          )}
        </article>
        <article className="status-card">
          <p className="kicker">Resolve Timeline</p>
          <div className="timeline-row">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={`timeline-node${steps[index] ? " is-done" : ""}${currentStep?.stepIndex === index ? " is-current" : ""}`}
              >
                <span>{index + 1}</span>
              </div>
            ))}
          </div>
          {currentStep ? (
            <p className="event-counter">
              Event {Math.min(activeResolveEventIndex + 1, currentStep.events.length)} / {currentStep.events.length}
            </p>
          ) : null}
        </article>
        <article className="status-card">
          <h2>Combat Log</h2>
          <div className="resolve-log">
            {steps.length ? (
              steps.map((step) => (
                <article key={step.stepIndex} className="resolve-step">
                  <p className="kicker">Pair {step.stepIndex + 1}</p>
                  <strong>
                    {step.revealedCards.host} vs {step.revealedCards.guest}
                  </strong>
                  <ul className="log-list">
                    {step.logs.map((log, index) => (
                      <li key={`${step.stepIndex}-${index}`}>{log}</li>
                    ))}
                  </ul>
                </article>
              ))
            ) : (
              <p className="empty-state">Waiting for the first card pair to resolve.</p>
            )}
          </div>
        </article>
      </section>
    </section>
  );
};

const ResultScreen = () => {
  const gameState = useGameStore((state) => state.gameState);
  const playerSession = useGameStore((state) => state.playerSession);
  const leaveGame = useGameStore((state) => state.leaveGame);

  if (!gameState?.result) {
    return null;
  }

  const title =
    gameState.result.outcome === "draw"
      ? "Draw"
      : gameState.result.winnerRole === playerSession?.role
        ? "Victory"
        : "Defeat";

  return (
    <section className="screen screen-result">
      <HeaderBar
        title={title}
        subtitle="The duel is over. Review the final state, then leave the room."
      />
      <article className="result-panel large">
        <p className="result-kicker">{title}</p>
        <h2 className="result-title">{gameState.result.reason}</h2>
        <div className="combat-grid">
          {gameState.battleState?.players.map((player) => (
            <article key={player.role} className="status-card">
              <h3>{formatRole(player.role)}</h3>
              <dl className="detail-grid">
                <div><dt>HP</dt><dd>{player.health}</dd></div>
                <div><dt>Energy</dt><dd>{player.energy}</dd></div>
                <div><dt>Position</dt><dd>{player.position}</dd></div>
                <div><dt>Character</dt><dd>{player.characterId ?? "-"}</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <BoardTrack />
        {playerSession ? (
          <div className="actions">
            <button onClick={() => leaveGame(playerSession.roomId, playerSession.playerToken)}>
              Leave Game
            </button>
          </div>
        ) : null}
      </article>
    </section>
  );
};

export const App = () => {
  const connect = useGameStore((state) => state.connect);
  const disconnect = useGameStore((state) => state.disconnect);
  const roomState = useGameStore((state) => state.roomState);
  const gameState = useGameStore((state) => state.gameState);
  const playerSession = useGameStore((state) => state.playerSession);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const activePhase = gameState?.phase === "paused_reconnect" ? gameState.pausedState : gameState?.phase;

  let screen = <HomeScreen />;

  if (playerSession && roomState && !gameState && roomState.playerCount < 2) {
    screen = <WaitingScreen />;
  } else if (activePhase === "character_select") {
    screen = <CharacterSelectScreen />;
  } else if (activePhase === "card_select") {
    screen = <CardSelectScreen />;
  } else if (activePhase === "resolving") {
    screen = <ResolvingScreen />;
  } else if (gameState?.phase === "finished") {
    screen = <ResultScreen />;
  }

  return (
    <main className="app-shell">
      <div className="stage-backdrop" />
      <div className="ornament ornament-left" />
      <div className="ornament ornament-right" />
      {screen}
      <PauseModal />
      <footer className="footer-note">Server: {serverUrl}</footer>
    </main>
  );
};
