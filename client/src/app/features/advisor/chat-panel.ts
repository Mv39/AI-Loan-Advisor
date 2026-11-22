import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdvisorStore } from '../../core/advisor.store';
import { SpeechService } from '../../core/speech.service';
import { ChatMarkdownPipe } from '../../shared/format';

const SUGGESTIONS = {
  en: ['Which loan suits me best?', 'Compare my top two options', 'What if I choose a longer tenure?', 'Why am I not eligible for other products?', 'Explain the total cost and APR'],
  hi: ['मेरे लिए कौन सा लोन सही है?', 'मेरे टॉप दो विकल्पों की तुलना करें', 'लंबी अवधि लेने पर क्या होगा?', 'मैं बाकी उत्पादों के लिए पात्र क्यों नहीं हूँ?'],
};

@Component({
  selector: 'app-chat-panel',
  imports: [FormsModule, ChatMarkdownPipe],
  template: `
    <section class="panel chat" aria-label="Chat with LoanSense">
      <div class="chat-log" #log role="log" aria-live="polite">
        @for (m of store.messages(); track m.id) {
          <div class="msg" [class.user]="m.role === 'user'" [class.error]="m.error">
            @if (m.pending) {
              <div class="bubble typing" aria-label="LoanSense is typing"><span></span><span></span><span></span></div>
            } @else {
              <div class="bubble" [innerHTML]="m.content | chatMarkdown"></div>
              @if (m.role === 'assistant' && m.source) {
                <div class="meta">
                  <span class="badge" [class.ai]="m.source === 'llm'">
                    {{ m.source === 'llm' ? 'AI · numbers verified against catalog' : 'Rules engine · deterministic' }}
                  </span>
                  @for (f of m.flags; track f) { <span class="badge warn">{{ f }}</span> }
                  @if (speech.canSpeak) {
                    <button class="link" (click)="speech.speak(m.content, store.language())" aria-label="Read aloud">🔊</button>
                  }
                </div>
                @if (m.disclaimer) {
                  <details class="disclaimer"><summary>Important: indicative only</summary>{{ m.disclaimer }} <span class="trace">Ref {{ m.traceId?.slice(0, 8) }}</span></details>
                }
              }
            }
          </div>
        }
      </div>

      <div class="chips" aria-label="Suggested questions">
        @for (s of suggestions(); track s) {
          <button class="chip" (click)="send(s)" [disabled]="store.sending()">{{ s }}</button>
        }
      </div>

      <form class="composer" (ngSubmit)="send(draft())">
        @if (speech.canListen) {
          <button type="button" class="icon-btn" [class.on]="speech.listening()" (click)="toggleMic()"
                  [attr.aria-label]="speech.listening() ? 'Stop voice input' : 'Speak your question'">🎤</button>
        }
        <input name="draft" [ngModel]="draft()" (ngModelChange)="draft.set($event)" maxlength="1000" autocomplete="off"
               [placeholder]="store.language() === 'hi' ? 'अपना सवाल लिखें…' : 'e.g. I need 3 lakh for my wedding over 2 years'"
               aria-label="Your message" />
        <button type="submit" class="btn primary" [disabled]="!draft().trim() || store.sending()">Send</button>
      </form>
      <p class="fineprint">Don't share PAN, Aadhaar, account or card numbers - they are automatically redacted.</p>
    </section>
  `,
})
export class ChatPanelComponent {
  readonly store = inject(AdvisorStore);
  readonly speech = inject(SpeechService);
  readonly draft = signal('');
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  readonly suggestions = () => SUGGESTIONS[this.store.language()];

  constructor() {
    effect(() => {
      this.store.messages(); // auto-scroll on new messages
      queueMicrotask(() => {
        const el = this.log()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  send(text: string) {
    if (!text.trim()) return;
    this.draft.set('');
    this.store.send(text);
  }

  toggleMic() {
    if (this.speech.listening()) this.speech.stop();
    else this.speech.listen(this.store.language(), (t) => this.send(t));
  }
}
