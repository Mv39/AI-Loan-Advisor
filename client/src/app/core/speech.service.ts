import { Injectable, signal } from '@angular/core';
import { Language } from './models';

/* Minimal typings for the (still prefixed in Chrome) Web Speech API. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

/** Voice input (speech-to-text) and read-aloud (text-to-speech), browser-native, no audio leaves the device via our API. */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly Recognition: (new () => SpeechRecognitionLike) | undefined = (() => {
    if (typeof window === 'undefined') return undefined;
    const w = window as unknown as Record<string, (new () => SpeechRecognitionLike) | undefined>;
    return w['SpeechRecognition'] ?? w['webkitSpeechRecognition'];
  })();
  private recognition?: SpeechRecognitionLike;

  readonly canListen = !!this.Recognition;
  readonly canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  readonly listening = signal(false);

  listen(lang: Language, onText: (text: string) => void): void {
    if (!this.Recognition) return;
    this.stop();
    const r = new this.Recognition();
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0].transcript).join(' ').trim();
      if (text) onText(text);
    };
    r.onerror = () => this.listening.set(false);
    r.onend = () => this.listening.set(false);
    this.recognition = r;
    this.listening.set(true);
    r.start();
  }

  stop(): void {
    this.recognition?.stop();
    this.listening.set(false);
  }

  speak(text: string, lang: Language): void {
    if (!this.canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*•#|]/g, ' ').replace(/₹/g, 'rupees '));
    u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }

  cancelSpeech(): void {
    if (this.canSpeak) window.speechSynthesis.cancel();
  }
}
