import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { io } from "socket.io-client";
import { API_BASE, store } from "../lib/api";
import { useAuth } from "./AuthContext";

const LiveContext = createContext({ version: 0, connected: false });

export function LiveProvider({ children }) {
  const { user } = useAuth();

  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let errorLogged = false;

    const socket = io(API_BASE || window.location.origin, {
      path: "/socket.io",
      autoConnect: false,
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      auth: {
        token: store.getToken() || undefined,
      },
    });

    const onConnect = () => {
      errorLogged = false;
      console.log("[ParkEase Socket] Connected:", socket.id);
      setConnected(true);
    };

    const onDisconnect = (reason) => {
      console.log("[ParkEase Socket] Disconnected:", reason);
      setConnected(false);
    };

    const onConnectError = (error) => {
      // Sirf ek baar log karo, har retry par nahi
      if (!errorLogged) {
        errorLogged = true;
        console.warn(
          "[ParkEase Socket] Connection error:",
          error.message,
          "- check that the backend is running. Retrying in background..."
        );
      }
      setConnected(false);
    };

    // Har reconnect attempt par latest token bhejo
    const onReconnectAttempt = () => {
      socket.auth = {
        token: store.getToken() || undefined,
      };
    };

    const onUpdate = () => {
      setVersion((prev) => prev + 1);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    socket.on("location:updated", onUpdate);
    socket.on("booking:updated", onUpdate);
    socket.on("notification:new", onUpdate);

    setConnected(false);

    // StrictMode ke pehle development cleanup cycle mein socket na khule
    const connectTask = window.setTimeout(() => {
      socket.connect();
    }, 0);

    return () => {
      window.clearTimeout(connectTask);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
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