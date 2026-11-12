
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { io } from "socket.io-client";
import { API_BASE, store } from "../lib/api";
import { useAuth } from "./AuthContext";

const LiveContext = createContext(null);

export function LiveProvider({ children }) {
  const { user } = useAuth();

  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(API_BASE || window.location.origin, {
      path: "/socket.io",
      autoConnect: false,
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: {
        token: store.getToken() || undefined,
      },
    });

    const onConnect = () => {
      console.log("[ParkEase Socket] Connected:", socket.id);
      setConnected(true);
    };

    const onDisconnect = (reason) => {
      console.log("[ParkEase Socket] Disconnected:", reason);
      setConnected(false);
    };

    const onConnectError = (error) => {
      console.error(
        "[ParkEase Socket] Connection error:",
        error.message
      );
      setConnected(false);
    };

    const onUpdate = () => {
      setVersion((prev) => prev + 1);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    socket.on("location:updated", onUpdate);
    socket.on("booking:updated", onUpdate);
    socket.on("notification:new", onUpdate);

    setConnected(false);

    // Avoid opening a socket during StrictMode's
    // first development-only effect cleanup cycle.
    const connectTask = window.setTimeout(() => {
      socket.connect();
    }, 0);

    return () => {
      window.clearTimeout(connectTask);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [user?.id]);

  return (
    <LiveContext.Provider value={{ version, connected }}>
      {children}
    </LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);
