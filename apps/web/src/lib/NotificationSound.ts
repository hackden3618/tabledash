/**
 * Web Audio API notification chime & device haptics utility.
 * Generates a pleasant, warm 2-tone chime using Web Audio oscillators
 * so no external MP3 asset download is required.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => 0);
  }
  return audioCtx;
}

/**
 * Triggers a native haptic vibration if supported by the browser/OS.
 */
export function triggerHaptics(pattern: number | number[] = [150, 60, 150]): boolean {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      return navigator.vibrate(pattern);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Plays a warm, non-intrusive 2-tone notification chime (D5 -> A5).
 */
export function playNotificationChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2: A5 (880.00 Hz) - starts slightly after tone 1
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.00, now + 0.12);
    gain2.gain.setValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.5);
  } catch {
    // Web Audio blocked or silent mode
  }
}

/**
 * Plays notification chime and triggers haptic vibration simultaneously.
 */
export function triggerNotificationAlert(): void {
  playNotificationChime();
  triggerHaptics([150, 60, 150]);
}
