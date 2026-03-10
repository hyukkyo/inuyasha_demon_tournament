import { useEffect, useState } from "react";
import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import type {
  Character,
  ClientToServerEvents,
  GameState,
  PlayerSession,
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
  socket?: Socket<ServerToClientEvents, ClientToServerEvents>;
  connect: () => void;
  disconnect: () => void;
  sendPing: () => void;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  selectCharacter: (characterId: string) => void;
  confirmCharacter: (characterId: string) => void;
};

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

const useConnectionStore = create<ConnectionState>((set, get) => ({
  connected: false,
  snapshot: undefined,
  roomState: undefined,
  gameState: undefined,
  playerSession: undefined,
  roomError: undefined,
  opponentConfirmedRole: undefined,
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
    });

    socket.on("disconnect", () => {
      set({ connected: false, socket: undefined });
    });

    socket.on("state:snapshot", (snapshot) => {
      set({
        snapshot,
        roomState: snapshot.roomState ?? get().roomState,
        gameState: snapshot.gameState ?? get().gameState,
        playerSession: snapshot.playerSession ?? get().playerSession,
      });
    });

    socket.on("room:created", (payload) => {
      set({
        roomState: payload.roomState,
        playerSession: {
          roomId: payload.roomId,
          playerToken: payload.playerToken,
          role: payload.role,
        },
        gameState: undefined,
        roomError: undefined,
      });
    });

    socket.on("room:joined", (payload) => {
      set({
        roomState: payload.roomState,
        playerSession: {
          roomId: payload.roomId,
          playerToken: payload.playerToken,
          role: payload.role,
        },
        gameState: undefined,
        roomError: undefined,
      });
    });

    socket.on("room:error", (payload) => {
      set({ roomError: payload });
    });

    socket.on("match:ready", (payload) => {
      set({ gameState: payload.gameState });
    });

    socket.on("character:phase_started", (payload) => {
      set({ gameState: payload.gameState });
    });

    socket.on("character:opponent_confirmed", (payload) => {
      if (payload.confirmed) {
        set({ opponentConfirmedRole: payload.role });
      }
    });

    set({ socket });
  },
  disconnect: () => {
    get().socket?.disconnect();
    set({
      connected: false,
      socket: undefined,
      roomState: undefined,
      gameState: undefined,
      playerSession: undefined,
      roomError: undefined,
      opponentConfirmedRole: undefined,
    });
  },
  sendPing: () => {
    get().socket?.emit("ping", { timestamp: Date.now() });
  },
  createRoom: () => {
    get().socket?.emit("room:create");
  },
  joinRoom: (roomId: string) => {
    get().socket?.emit("room:join", { roomId: roomId.trim().toUpperCase() });
  },
  selectCharacter: (characterId: string) => {
    get().socket?.emit("character:select", { characterId });
  },
  confirmCharacter: (characterId: string) => {
    get().socket?.emit("character:confirm", { characterId });
  },
}));

export const App = () => {
  const connected = useConnectionStore((state) => state.connected);
  const snapshot = useConnectionStore((state) => state.snapshot);
  const roomState = useConnectionStore((state) => state.roomState);
  const gameState = useConnectionStore((state) => state.gameState);
  const playerSession = useConnectionStore((state) => state.playerSession);
  const roomError = useConnectionStore((state) => state.roomError);
  const opponentConfirmedRole = useConnectionStore((state) => state.opponentConfirmedRole);
  const connect = useConnectionStore((state) => state.connect);
  const disconnect = useConnectionStore((state) => state.disconnect);
  const sendPing = useConnectionStore((state) => state.sendPing);
  const createRoom = useConnectionStore((state) => state.createRoom);
  const joinRoom = useConnectionStore((state) => state.joinRoom);
  const selectCharacter = useConnectionStore((state) => state.selectCharacter);
  const confirmCharacter = useConnectionStore((state) => state.confirmCharacter);
  const [roomIdInput, setRoomIdInput] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const characterSelect = gameState?.characterSelect;
  const mySelection = characterSelect?.selections.find(
    (selection) => selection.role === playerSession?.role,
  );
  const opponentSelection = characterSelect?.selections.find(
    (selection) => selection.role !== playerSession?.role,
  );
  const selectedCharacterId = mySelection?.characterId;

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    if (!gameState?.turnDeadline) {
      setRemainingSeconds(null);
      return;
    }

    const update = () => {
      setRemainingSeconds(Math.max(Math.ceil((gameState.turnDeadline! - Date.now()) / 1000), 0));
    };

    update();
    const interval = window.setInterval(update, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [gameState?.turnDeadline]);

  const handleCharacterSelect = (character: Character) => {
    selectCharacter(character.id);
  };

  const handleCharacterConfirm = () => {
    if (!selectedCharacterId) {
      return;
    }

    confirmCharacter(selectedCharacterId);
  };

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">MVP Step 3</p>
        <h1>Room Lobby and Character Select</h1>
        <p className="summary">
          Create a room, join from a second browser, then confirm a character within 10
          seconds. When both players confirm, the server advances to the next phase.
        </p>

        <dl className="status-grid">
          <div>
            <dt>Server URL</dt>
            <dd>{serverUrl}</dd>
          </div>
          <div>
            <dt>Connection</dt>
            <dd>{connected ? "connected" : "disconnected"}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{snapshot?.phase ?? "unknown"}</dd>
          </div>
          <div>
            <dt>Server Time</dt>
            <dd>{snapshot ? new Date(snapshot.serverTime).toLocaleTimeString() : "-"}</dd>
          </div>
        </dl>

        <div className="actions">
          <button onClick={createRoom} disabled={!connected || Boolean(playerSession)}>
            Create Room
          </button>
          <label className="room-join-field">
            <span className="sr-only">Room ID</span>
            <input
              value={roomIdInput}
              onChange={(event) =>
                setRoomIdInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
              }
              placeholder="ROOM ID"
            />
          </label>
          <button
            onClick={() => joinRoom(roomIdInput)}
            disabled={!connected || roomIdInput.length !== 6 || Boolean(playerSession)}
          >
            Join Room
          </button>
          <button onClick={sendPing} disabled={!connected}>
            Send Ping
          </button>
          <button onClick={disconnect} disabled={!connected} className="ghost">
            Disconnect
          </button>
          <button onClick={connect} disabled={connected} className="ghost">
            Reconnect
          </button>
        </div>

        {roomError ? (
          <section className="error-box">
            <strong>{roomError.code}</strong>
            <p>{roomError.message}</p>
          </section>
        ) : null}

        <section className="room-box">
          <h2>Current Session</h2>
          {playerSession ? (
            <dl className="detail-grid">
              <div>
                <dt>Role</dt>
                <dd>{playerSession.role}</dd>
              </div>
              <div>
                <dt>Room ID</dt>
                <dd>{playerSession.roomId}</dd>
              </div>
              <div>
                <dt>Player Token</dt>
                <dd className="mono">{playerSession.playerToken}</dd>
              </div>
            </dl>
          ) : (
            <p className="empty-state">No room joined yet.</p>
          )}
        </section>

        <section className="room-box">
          <h2>Room State</h2>
          {roomState ? (
            <dl className="detail-grid">
              <div>
                <dt>Status</dt>
                <dd>{roomState.status}</dd>
              </div>
              <div>
                <dt>Players</dt>
                <dd>
                  {roomState.playerCount}/{roomState.capacity}
                </dd>
              </div>
              <div>
                <dt>Expires At</dt>
                <dd>{new Date(roomState.expiresAt).toLocaleTimeString()}</dd>
              </div>
              <div>
                <dt>Roster</dt>
                <dd>{roomState.players.map((player) => `${player.role}:${player.connected ? "on" : "off"}`).join(", ")}</dd>
              </div>
            </dl>
          ) : (
            <p className="empty-state">Create or join a room to inspect lobby state.</p>
          )}
        </section>

        <section className="room-box">
          <h2>Character Select</h2>
          {gameState?.phase === "character_select" && characterSelect ? (
            <>
              <div className="phase-meta">
                <span>Remaining: {remainingSeconds ?? "-" }s</span>
                <span>
                  Opponent confirmed:{" "}
                  {opponentSelection?.confirmed || opponentConfirmedRole === opponentSelection?.role
                    ? "yes"
                    : "no"}
                </span>
              </div>
              <div className="character-grid">
                {characterSelect.availableCharacters.map((character) => {
                  const active = selectedCharacterId === character.id;

                  return (
                    <button
                      key={character.id}
                      type="button"
                      className={`character-card${active ? " is-active" : ""}`}
                      onClick={() => handleCharacterSelect(character)}
                      disabled={mySelection?.confirmed}
                    >
                      <strong>{character.name}</strong>
                      <span>{character.archetype}</span>
                      <small>{character.summary}</small>
                    </button>
                  );
                })}
              </div>
              <div className="actions">
                <button
                  onClick={handleCharacterConfirm}
                  disabled={!selectedCharacterId || Boolean(mySelection?.confirmed)}
                >
                  Confirm Character
                </button>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>My Selection</dt>
                  <dd>{selectedCharacterId ?? "none"}</dd>
                </div>
                <div>
                  <dt>My Confirmed</dt>
                  <dd>{mySelection?.confirmed ? "yes" : "no"}</dd>
                </div>
                <div>
                  <dt>Timed Out</dt>
                  <dd>{mySelection?.timedOut ? "yes" : "no"}</dd>
                </div>
                <div>
                  <dt>Phase</dt>
                  <dd>{gameState.phase}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="empty-state">
              Character select starts automatically when two players join the same room.
            </p>
          )}
        </section>

        <section className="snapshot-box">
          <h2>Latest Snapshot</h2>
          <pre>{JSON.stringify(snapshot ?? null, null, 2)}</pre>
        </section>
      </section>
    </main>
  );
};
