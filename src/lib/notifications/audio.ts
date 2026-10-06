/**
 * Web Audio API synthesized notification chimes.
 * Works 100% offline, zero network requests, 0ms latency, zero external asset dependencies.
 */

let sharedAudioContext: AudioContext | null = null;
let isChimePlaying = false;
let lastChimePlayedAt = 0;

/**
 * Returns or initializes the shared browser AudioContext.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!sharedAudioContext || sharedAudioContext.state === "closed") {
      sharedAudioContext = new AudioContextClass();
    }
    return sharedAudioContext;
  } catch (err) {
    console.warn("Unable to initialize AudioContext:", err);
    return null;
  }
}

/**
 * Checks whether audio playback is currently blocked by browser autoplay policies.
 */
export function isAudioAutoplayBlocked(): boolean {
  if (!sharedAudioContext) return false;
  return sharedAudioContext.state === "suspended";
}

/**
 * Attempts to resume/unlock the AudioContext after explicit user interaction.
 */
export async function unlockAudioContext(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx.state === "running";
  } catch (err) {
    console.warn("Failed to resume AudioContext:", err);
    return false;
  }
}

/**
 * Plays a pleasant, two-tone crystal chime (E5 -> B5, 659.25Hz -> 987.77Hz) for new waiter/service calls.
 * Implements anti-collision and debounce locks to prevent audio distortion or overlapping.
 */
export async function playNewServiceRequestChime(volume: number = 0.25): Promise<{ success: boolean; blocked: boolean }> {
  const nowMs = Date.now();
  // Prevent duplicate overlapping chimes within 1.2 seconds
  if (isChimePlaying || nowMs - lastChimePlayedAt < 1200) {
    return { success: false, blocked: false };
  }

  const ctx = getAudioContext();
  if (!ctx) return { success: false, blocked: false };

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return { success: false, blocked: true };
    }
    if (ctx.state === "suspended") {
      return { success: false, blocked: true };
    }
  }

  try {
    isChimePlaying = true;
    lastChimePlayedAt = nowMs;

    const t0 = ctx.currentTime;
    const clampedVol = Math.max(0.01, Math.min(volume, 1.0));

    // Tone 1: E5 (659.25 Hz) with gentle harmonic overtone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, t0);
    osc1.frequency.exponentialRampToValueAtTime(783.99, t0 + 0.12); // subtle pitch glide (G5)

    gain1.gain.setValueAtTime(clampedVol * 0.8, t0);
    gain1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(t0);
    osc1.stop(t0 + 0.45);

    // Tone 2: B5 (987.77 Hz) - bright, attentive bell ping
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(987.77, t0 + 0.12);

    gain2.gain.setValueAtTime(clampedVol, t0 + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(t0 + 0.12);
    osc2.stop(t0 + 0.7);

    setTimeout(() => {
      isChimePlaying = false;
    }, 750);

    return { success: true, blocked: false };
  } catch (err) {
    console.warn("Failed to play service request chime:", err);
    isChimePlaying = false;
    return { success: false, blocked: false };
  }
}

/**
 * Plays a subtle, gentle double pulse (440Hz -> 587Hz) for unacknowledged repeat reminders.
 */
export async function playReminderChime(volume: number = 0.2): Promise<{ success: boolean; blocked: boolean }> {
  const nowMs = Date.now();
  if (isChimePlaying || nowMs - lastChimePlayedAt < 1000) {
    return { success: false, blocked: false };
  }

  const ctx = getAudioContext();
  if (!ctx || ctx.state === "suspended") {
    return { success: false, blocked: ctx?.state === "suspended" };
  }

  try {
    isChimePlaying = true;
    lastChimePlayedAt = nowMs;

    const t0 = ctx.currentTime;
    const clampedVol = Math.max(0.01, Math.min(volume, 0.8));

    // Tap 1: A4 (440 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(440, t0);
    gain1.gain.setValueAtTime(clampedVol * 0.6, t0);
    gain1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t0);
    osc1.stop(t0 + 0.2);

    // Tap 2: D5 (587.33 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(587.33, t0 + 0.15);
    gain2.gain.setValueAtTime(clampedVol * 0.8, t0 + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t0 + 0.15);
    osc2.stop(t0 + 0.4);

    setTimeout(() => {
      isChimePlaying = false;
    }, 450);

    return { success: true, blocked: false };
  } catch {
    isChimePlaying = false;
    return { success: false, blocked: false };
  }
}
