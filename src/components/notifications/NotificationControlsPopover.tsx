"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Volume2,
  VolumeX,
  Bell,
  Check,
  Play,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useRestaurantNotifications } from "@/context/RestaurantNotificationContext";

export function NotificationControlsPopover() {
  const {
    restaurantId,
    soundEnabled,
    toggleSound,
    repeatInterval,
    setRepeatInterval,
    browserPermission,
    requestPermission,
    audioBlocked,
    unblockAudio,
    testChime,
  } = useRestaurantNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [testingSound, setTestingSound] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (!restaurantId || restaurantId === "new") return null;

  async function handleTestChime() {
    setTestingSound(true);
    await testChime();
    setTimeout(() => setTestingSound(false), 800);
  }

  return (
    <div className="relative" ref={containerRef} suppressHydrationWarning>
      {/* Single Unified Sound & Alert Control Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        suppressHydrationWarning
        className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
          isOpen
            ? "bg-slate-800 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10"
            : soundEnabled
            ? "bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20"
            : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300"
        }`}
        title={soundEnabled ? "Sound Alerts: Active (Click to adjust)" : "Sound Alerts: Muted (Click to enable)"}
        aria-label="Sound & alert settings"
      >
        {soundEnabled ? (
          <Volume2 className="w-4 h-4 stroke-[2.2] flex-shrink-0" />
        ) : (
          <VolumeX className="w-4 h-4 stroke-[2.2] flex-shrink-0" />
        )}
        <span className="hidden sm:inline text-xs font-medium">
          {soundEnabled ? "Sound On" : "Muted"}
        </span>
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 glass-card p-4 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Service Alerts &amp; Sound
              </h4>
            </div>
            <button
              type="button"
              onClick={handleTestChime}
              disabled={testingSound}
              className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-2.5 h-2.5 fill-current" />
              <span>{testingSound ? "Playing..." : "Test Chime"}</span>
            </button>
          </div>

          {/* Audio Autoplay Warning */}
          {audioBlocked && (
            <div
              onClick={unblockAudio}
              className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-500/25 transition"
            >
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-[11px] font-medium leading-tight">
                  Audio paused by browser. Tap to enable.
                </span>
              </div>
              <span className="text-[10px] font-bold underline text-white">Enable</span>
            </div>
          )}

          {/* Sound Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Audio Chime</p>
              <p className="text-[10px] text-slate-400">Play crystal bell when guest calls</p>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                soundEnabled ? "bg-amber-400" : "bg-slate-800 border border-slate-700"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-slate-950 transition-transform absolute top-1 left-1 ${
                  soundEnabled ? "translate-x-4 bg-slate-950" : "bg-slate-400"
                }`}
              />
            </button>
          </div>

          {/* Browser Notifications */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Browser Push</p>
              <p className="text-[10px] text-slate-400">Alert even when tab is backgrounded</p>
            </div>
            {browserPermission === "granted" ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Active</span>
              </span>
            ) : browserPermission === "denied" ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                Blocked
              </span>
            ) : (
              <button
                type="button"
                onClick={requestPermission}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition cursor-pointer"
              >
                Enable
              </button>
            )}
          </div>

          {/* Repeat Reminders Selector */}
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Repeat Reminders</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {repeatInterval === 0 ? "Off" : `Every ${repeatInterval}s`}
              </span>
            </div>
            <select
              value={repeatInterval}
              onChange={(e) => setRepeatInterval(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-amber-400"
            >
              <option value={0}>Disabled (Single alert only)</option>
              <option value={30}>Every 30 seconds</option>
              <option value={60}>Every 60 seconds (Recommended)</option>
              <option value={120}>Every 2 minutes</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
