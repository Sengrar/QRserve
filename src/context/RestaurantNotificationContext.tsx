"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import {
  playNewServiceRequestChime,
  playReminderChime,
  isAudioAutoplayBlocked,
  unlockAudioContext,
} from "@/lib/notifications/audio";
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserNotification,
  NotificationPermissionStatus,
} from "@/lib/notifications/browser";

export interface ServiceRequestToast {
  id: string;
  tableNumber: string;
  tableName: string | null;
  type: "CALL_WAITER" | "WATER" | "CUTLERY" | "CLEANING" | "OTHER";
  message: string | null;
  createdAt: string | Date;
  isReminder?: boolean;
}

interface NotificationContextValue {
  restaurantId: string | null;
  pendingCount: number;
  soundEnabled: boolean;
  toggleSound: () => void;
  repeatInterval: number; // in seconds (0 = off)
  setRepeatInterval: (sec: number) => void;
  browserPermission: NotificationPermissionStatus;
  requestPermission: () => Promise<void>;
  audioBlocked: boolean;
  unblockAudio: () => Promise<void>;
  testChime: () => Promise<void>;
  toasts: ServiceRequestToast[];
  dismissToast: (id: string) => void;
  dismissAllToasts: () => void;
  quickAcceptRequest: (id: string) => Promise<boolean>;
  refreshNow: () => Promise<void>;
}

const RestaurantNotificationContext = createContext<NotificationContextValue | null>(null);

function getTypeFriendlyName(type: string): string {
  switch (type) {
    case "CALL_WAITER":
      return "Call Waiter";
    case "WATER":
      return "Water Refill";
    case "CUTLERY":
      return "Extra Cutlery / Plates";
    case "CLEANING":
      return "Table Cleaning";
    case "OTHER":
    default:
      return "Service Assistance";
  }
}

interface ProviderProps {
  restaurantId: string | null;
  children: React.ReactNode;
}

export function RestaurantNotificationProvider({ restaurantId, children }: ProviderProps) {
  const router = useRouter();

  // Settings state with localStorage persistence
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("qrserve_sound_alert_enabled");
    return stored === null ? true : stored === "true";
  });

  const [repeatInterval, setRepeatIntervalState] = useState<number>(() => {
    if (typeof window === "undefined") return 60;
    const stored = localStorage.getItem("qrserve_repeat_reminder_interval");
    return stored !== null ? Number(stored) : 60;
  });

  const [browserPermission, setBrowserPermission] = useState<NotificationPermissionStatus>(() => {
    return getBrowserNotificationPermission();
  });
  const [audioBlocked, setAudioBlocked] = useState<boolean>(() => {
    return isAudioAutoplayBlocked();
  });

  // Live request & toast state
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [toasts, setToasts] = useState<ServiceRequestToast[]>([]);

  // Internal tracking refs to prevent re-render loops
  const isFirstPollRef = useRef(true);
  const knownRequestIdsRef = useRef<Set<string>>(new Set());
  const acknowledgedRequestIdsRef = useRef<Set<string>>(new Set());
  const lastAlertTimestampRef = useRef<number>(0);
  const activeRestaurantIdRef = useRef<string | null>(restaurantId);

  // Keep activeRestaurantIdRef in sync
  useEffect(() => {
    activeRestaurantIdRef.current = restaurantId;
  }, [restaurantId]);

  // Listen to first user interaction on window to auto-unlock audio if blocked
  useEffect(() => {
    function onFirstUserGesture() {
      unlockAudioContext().then((unlocked) => {
        if (unlocked) setAudioBlocked(false);
      });
      window.removeEventListener("click", onFirstUserGesture);
      window.removeEventListener("keydown", onFirstUserGesture);
    }

    window.addEventListener("click", onFirstUserGesture);
    window.addEventListener("keydown", onFirstUserGesture);

    return () => {
      window.removeEventListener("click", onFirstUserGesture);
      window.removeEventListener("keydown", onFirstUserGesture);
    };
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("qrserve_sound_alert_enabled", String(next));
      }
      return next;
    });
  }, []);

  const setRepeatInterval = useCallback((sec: number) => {
    setRepeatIntervalState(sec);
    if (typeof window !== "undefined") {
      localStorage.setItem("qrserve_repeat_reminder_interval", String(sec));
    }
  }, []);

  const requestPermission = useCallback(async () => {
    const status = await requestBrowserNotificationPermission();
    setBrowserPermission(status);
  }, []);

  const unblockAudio = useCallback(async () => {
    const unlocked = await unlockAudioContext();
    if (unlocked) {
      setAudioBlocked(false);
      await playNewServiceRequestChime(0.15);
    }
  }, []);

  const testChime = useCallback(async () => {
    const result = await playNewServiceRequestChime(0.25);
    if (result.blocked) {
      setAudioBlocked(true);
    } else {
      setAudioBlocked(false);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    acknowledgedRequestIdsRef.current.add(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAllToasts = useCallback(() => {
    toasts.forEach((t) => acknowledgedRequestIdsRef.current.add(t.id));
    setToasts([]);
  }, [toasts]);

  // Main polling engine
  const fetchAndProcessRequests = useCallback(async () => {
    const currentId = activeRestaurantIdRef.current;
    if (!currentId || currentId === "new") return;

    try {
      const res = await fetch(
        `/api/restaurants/${currentId}/service-requests?status=PENDING&limit=25&includeStats=false`
      );
      if (!res.ok) return;

      const json = await res.json();
      if (!json.success || !json.data) return;

      const requests: Array<{
        id: string;
        tableId: string;
        type: "CALL_WAITER" | "WATER" | "CUTLERY" | "CLEANING" | "OTHER";
        status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
        message: string | null;
        createdAt: string;
        table: { tableNumber: string; name: string | null };
      }> = json.data.requests || [];

      const pendingList = requests.filter((r) => r.status === "PENDING");
      setPendingCount(json.data.stats?.pending ?? pendingList.length);

      // 1. Initial Load: populate known IDs without sound spam
      if (isFirstPollRef.current) {
        requests.forEach((r) => knownRequestIdsRef.current.add(r.id));
        isFirstPollRef.current = false;
        // If there are already pending requests on initial page load, set the alert timestamp
        if (pendingList.length > 0) {
          lastAlertTimestampRef.current = Date.now();
        }
        return;
      }

      // 2. Identify Brand-New PENDING Requests
      const brandNewRequests = pendingList.filter(
        (r) => !knownRequestIdsRef.current.has(r.id) && !acknowledgedRequestIdsRef.current.has(r.id)
      );

      if (brandNewRequests.length > 0) {
        // Register all new requests
        brandNewRequests.forEach((r) => knownRequestIdsRef.current.add(r.id));

        // Create in-app Toast notifications
        const newToasts: ServiceRequestToast[] = brandNewRequests.map((r) => ({
          id: r.id,
          tableNumber: r.table.tableNumber,
          tableName: r.table.name,
          type: r.type,
          message: r.message,
          createdAt: r.createdAt,
          isReminder: false,
        }));

        setToasts((prev) => [...newToasts, ...prev].slice(0, 5));

        // Trigger Audio Chime (if enabled)
        if (soundEnabled) {
          playNewServiceRequestChime().then((res) => {
            if (res.blocked) setAudioBlocked(true);
            else setAudioBlocked(false);
          });
        }

        // Trigger HTML5 Web Notification
        const newest = brandNewRequests[0];
        const title = `🔔 Table ${newest.table.tableNumber}: ${getTypeFriendlyName(newest.type)}`;
        const body = newest.message
          ? `"${newest.message}" • Tap to view request`
          : `Guest requested ${getTypeFriendlyName(newest.type)}. Tap to respond.`;

        sendBrowserNotification({
          title,
          body,
          tag: `service-req-${newest.id}`,
          onClick: () => {
            router.push(`/restaurants/${currentId}/service-requests`);
          },
        });

        lastAlertTimestampRef.current = Date.now();
        return;
      }

      // 3. Repeat Reminder Logic
      if (pendingList.length > 0 && repeatInterval > 0) {
        const now = Date.now();
        const intervalMs = repeatInterval * 1000;

        if (now - lastAlertTimestampRef.current >= intervalMs) {
          // Play gentle reminder chime
          if (soundEnabled) {
            playReminderChime().then((res) => {
              if (res.blocked) setAudioBlocked(true);
            });
          }

          // Show / update reminder toast for the oldest pending request
          const oldest = pendingList[pendingList.length - 1];
          const reminderToast: ServiceRequestToast = {
            id: `reminder-${oldest.id}-${now}`,
            tableNumber: oldest.table.tableNumber,
            tableName: oldest.table.name,
            type: oldest.type,
            message: oldest.message,
            createdAt: oldest.createdAt,
            isReminder: true,
          };

          setToasts((prev) => [reminderToast, ...prev.filter((t) => !t.isReminder)].slice(0, 5));

          lastAlertTimestampRef.current = now;
        }
      } else if (pendingList.length === 0) {
        lastAlertTimestampRef.current = 0;
      }
    } catch (err) {
      console.warn("Polling service requests error:", err);
    }
  }, [repeatInterval, soundEnabled, router]);

  // Background polling interval (every 8 seconds)
  useEffect(() => {
    if (!restaurantId || restaurantId === "new") return;

    // Run first check immediately
    fetchAndProcessRequests();

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return; // Pause polling when tab is hidden to save battery and network
      }
      fetchAndProcessRequests();
    }, 8000);

    return () => clearInterval(interval);
  }, [restaurantId, fetchAndProcessRequests]);

  // Quick Accept action right from notification toast
  const quickAcceptRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      const currentId = activeRestaurantIdRef.current;
      if (!currentId) return false;

      // Clean ID if reminder format
      const cleanId = requestId.startsWith("reminder-")
        ? requestId.split("-")[1]
        : requestId;

      try {
        const res = await fetch(
          `/api/restaurants/${currentId}/service-requests/${cleanId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "IN_PROGRESS" }),
          }
        );

        if (res.ok) {
          dismissToast(requestId);
          acknowledgedRequestIdsRef.current.add(cleanId);
          // Refresh state immediately
          fetchAndProcessRequests();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [dismissToast, fetchAndProcessRequests]
  );

  return (
    <RestaurantNotificationContext.Provider
      value={{
        restaurantId,
        pendingCount,
        soundEnabled,
        toggleSound,
        repeatInterval,
        setRepeatInterval,
        browserPermission,
        requestPermission,
        audioBlocked,
        unblockAudio,
        testChime,
        toasts,
        dismissToast,
        dismissAllToasts,
        quickAcceptRequest,
        refreshNow: fetchAndProcessRequests,
      }}
    >
      {children}
    </RestaurantNotificationContext.Provider>
  );
}

const defaultNotificationContext: NotificationContextValue = {
  restaurantId: null,
  pendingCount: 0,
  soundEnabled: true,
  toggleSound: () => {},
  repeatInterval: 60,
  setRepeatInterval: () => {},
  browserPermission: "default",
  requestPermission: async () => {},
  audioBlocked: false,
  unblockAudio: async () => {},
  testChime: async () => {},
  toasts: [],
  dismissToast: () => {},
  dismissAllToasts: () => {},
  quickAcceptRequest: async () => false,
  refreshNow: async () => {},
};

export function useRestaurantNotifications() {
  const context = useContext(RestaurantNotificationContext);
  return context || defaultNotificationContext;
}

