import { useEffect } from "react";
import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents, StateSnapshot } from "@inuyasha/shared";

type ConnectionState = {
  connected: boolean;
  snapshot?: StateSnapshot;
  socket?: Socket<ServerToClientEvents, ClientToServerEvents>;
  connect: () => void;
  disconnect: () => void;
  sendPing: () => void;
};

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

const useConnectionStore = create<ConnectionState>((set, get) => ({
  connected: false,
  snapshot: undefined,
  socket: undefined,
  connect: () => {
    if (get().socket) {
      return;
    }

    const socket = io(serverUrl, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      set({ connected: true });
    });

    socket.on("disconnect", () => {
      set({ connected: false, socket: undefined });
    });

    socket.on("state:snapshot", (snapshot) => {
      set({ snapshot });
    });

    set({ socket });
  },
  disconnect: () => {
    get().socket?.disconnect();
    set({ connected: false, socket: undefined });
  },
  sendPing: () => {
    get().socket?.emit("ping", { timestamp: Date.now() });
  },
}));

export const App = () => {
  const connected = useConnectionStore((state) => state.connected);
  const snapshot = useConnectionStore((state) => state.snapshot);
  const connect = useConnectionStore((state) => state.connect);
  const disconnect = useConnectionStore((state) => state.disconnect);
  const sendPing = useConnectionStore((state) => state.sendPing);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">MVP Step 1</p>
        <h1>Realtime Connection Check</h1>
        <p className="summary">
          Frontend and backend are scaffolded. This page verifies the base Socket.IO
          connection required for room flow development.
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

        <section className="snapshot-box">
          <h2>Latest Snapshot</h2>
          <pre>{JSON.stringify(snapshot ?? null, null, 2)}</pre>
        </section>
      </section>
    </main>
  );
};
