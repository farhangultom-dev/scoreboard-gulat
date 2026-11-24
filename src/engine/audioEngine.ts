/**
 * Web Audio API Engine untuk Olympic Wrestling Digital Scoreboard.
 * Menghasilkan synthesized buzzer/horn tanpa ketergantungan file audio eksternal.
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Initialized lazily on first user interaction
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    return this.ctx;
  }

  /**
   * Unlock AudioContext saat interaksi klik pertama operator
   */
  public async unlockAudio(): Promise<void> {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('Could not resume AudioContext:', err);
      }
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  /**
   * Suara buzzer/horn akhir babak (Period End):
   * Dual oscillator (sawtooth 220Hz + square 277.18Hz) dengan gain envelope ~1.2 detik.
   */
  public playPeriodEndBuzzer(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const duration = 1.2;

      // Master Gain Node untuk volume & envelope
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.exponentialRampToValueAtTime(0.8, now + 0.05); // Attack
      masterGain.gain.setValueAtTime(0.8, now + 1.0); // Sustain
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration); // Release
      masterGain.connect(ctx.destination);

      // Oscillator 1: Sawtooth 220Hz (A3)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(220, now);

      // Oscillator 2: Square 277.18Hz (C#4)
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(277.18, now);

      osc1.connect(masterGain);
      osc2.connect(masterGain);

      osc1.start(now);
      osc2.start(now);

      osc1.stop(now + duration);
      osc2.stop(now + duration);
    } catch (err) {
      console.warn('Audio playback error (Period End Buzzer):', err);
    }
  }

  /**
   * Bunyi beep tajam saat akhir Activity Clock 30s atau jeda babak (880Hz, durasi ~0.4 detik).
   */
  public playActivityEndBeep(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const duration = 0.4;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.6, now + 0.02);
      gainNode.gain.setValueAtTime(0.6, now + 0.35);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
      gainNode.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5

      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + duration);
    } catch (err) {
      console.warn('Audio playback error (Activity End Beep):', err);
    }
  }
}

export const audioEngine = new AudioEngine();
