import { Component, inject, OnInit } from '@angular/core';
import { AdvisorStore } from '../../core/advisor.store';
import { AuthService } from '../../core/auth.service';
import { Language } from '../../core/models';
import { SpeechService } from '../../core/speech.service';
import { ChatPanelComponent } from './chat-panel';
import { ProfileFormComponent } from './profile-form';
import { RecommendationsPanelComponent } from './recommendations-panel';

@Component({
  selector: 'app-advisor',
  imports: [ProfileFormComponent, ChatPanelComponent, RecommendationsPanelComponent],
  template: `
    <header class="topbar">
      <div class="brand"><span class="logo">₹</span> LoanSense <small>AI Loan Advisor</small></div>
      <div class="topbar-right">
        @if (store.llmStatus()) { <span class="status" [class.off]="!store.llmStatus().startsWith('enabled')">AI {{ store.llmStatus() }}</span> }
        <div class="seg" role="group" aria-label="Language">
          <button [class.on]="store.language() === 'en'" (click)="setLang('en')">EN</button>
          <button [class.on]="store.language() === 'hi'" (click)="setLang('hi')">हिं</button>
        </div>
        @if (speech.canSpeak) {
          <button class="btn sm ghost" [class.on]="store.readAloud()" (click)="toggleReadAloud()" [attr.aria-pressed]="store.readAloud()">🔊 Read aloud</button>
        }
        <span class="user">{{ auth.displayName() }}</span>
        <button class="btn sm ghost" (click)="logout()">Sign out</button>
      </div>
    </header>
    @if (store.error()) {
      <div class="alert banner" role="alert">{{ store.error() }} <button class="link" (click)="store.error.set(null)">Dismiss</button></div>
    }
    <main class="layout">
      <aside class="col-profile"><app-profile-form /></aside>
      <section class="col-chat"><app-chat-panel /></section>
      <aside class="col-recs"><app-recommendations-panel /></aside>
    </main>
  `,
})
export class AdvisorComponent implements OnInit {
  readonly store = inject(AdvisorStore);
  readonly auth = inject(AuthService);
  readonly speech = inject(SpeechService);

  ngOnInit() {
    this.store.init();
  }

  setLang(l: Language) {
    this.store.language.set(l);
  }

  toggleReadAloud() {
    this.store.readAloud.update((v) => !v);
    if (!this.store.readAloud()) this.speech.cancelSpeech();
  }

  logout() {
    this.speech.cancelSpeech();
    this.auth.logout();
  }
}
