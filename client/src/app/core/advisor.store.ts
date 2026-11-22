import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AdvisorReply, BorrowerProfile, ComparisonRow, Language, RecommendationResult, UiMessage } from './models';
import { SpeechService } from './speech.service';

const errorMessage = (e: unknown): string => {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Cannot reach the server. Please check your connection.';
    if (e.status === 429) return 'You are sending messages too quickly. Please wait a minute.';
    const issues = e.error?.issues as { path: string; message: string }[] | undefined;
    if (issues?.length) return issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    return e.error?.message ?? 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
};

/** Single source of UI state (signals). Components stay thin and declarative. */
@Injectable({ providedIn: 'root' })
export class AdvisorStore {
  private readonly api = inject(ApiService);
  private readonly speech = inject(SpeechService);

  readonly profile = signal<BorrowerProfile | null>(null);
  readonly result = signal<RecommendationResult | null>(null);
  readonly comparison = signal<ComparisonRow[] | null>(null);
  readonly selectedForCompare = signal<string[]>([]);
  readonly messages = signal<UiMessage[]>([]);
  readonly language = signal<Language>('en');
  readonly readAloud = signal(false);
  readonly sending = signal(false);
  readonly loadingRecs = signal(false);
  readonly error = signal<string | null>(null);
  readonly llmStatus = signal<string>('');
  private sessionId: string | null = null;

  readonly recommendations = computed(() => this.result()?.recommendations ?? []);

  async init(): Promise<void> {
    this.messages.set([]);
    this.comparison.set(null);
    this.selectedForCompare.set([]);
    try {
      const [profile, health, session] = await Promise.all([this.api.getProfile(), this.api.health(), this.api.createSession()]);
      this.profile.set(profile);
      this.llmStatus.set(health.llm);
      this.sessionId = session.id;
      await this.refreshRecommendations();
      this.messages.set([
        {
          id: 'welcome',
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content:
            this.language() === 'hi'
              ? 'नमस्ते! मैं LoanSense हूँ। दाईं ओर आपकी प्रोफ़ाइल के आधार पर सुझाव हैं। आप मुझसे EMI, अवधि या उत्पादों की तुलना के बारे में पूछ सकते हैं।'
              : "Hi! I'm LoanSense. Your personalised options are on the right, based on your profile. Ask me about EMIs, tenure trade-offs, or to compare products. You can also tell me things like \"I need 3 lakh for 2 years\".",
        },
      ]);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async saveProfile(p: BorrowerProfile): Promise<boolean> {
    this.error.set(null);
    try {
      this.profile.set(await this.api.saveProfile(p));
      this.comparison.set(null);
      await this.refreshRecommendations();
      return true;
    } catch (e) {
      this.error.set(errorMessage(e));
      return false;
    }
  }

  async refreshRecommendations(): Promise<void> {
    this.loadingRecs.set(true);
    try {
      this.result.set(await this.api.recommendations());
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loadingRecs.set(false);
    }
  }

  toggleCompare(productId: string): void {
    this.selectedForCompare.update((ids) =>
      ids.includes(productId) ? ids.filter((i) => i !== productId) : [...ids, productId].slice(-3),
    );
  }

  async runCompare(): Promise<void> {
    const ids = this.selectedForCompare();
    if (ids.length < 2) return;
    try {
      this.comparison.set((await this.api.compare(ids)).comparison);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async send(text: string): Promise<void> {
    const message = text.trim();
    if (!message || this.sending() || !this.sessionId) return;
    this.error.set(null);
    const pendingId = `pending-${Date.now()}`;
    const userId = `u-${Date.now()}`;
    this.messages.update((m) => [
      ...m,
      { id: userId, role: 'user', content: message, createdAt: new Date().toISOString() },
      { id: pendingId, role: 'assistant', content: '', createdAt: new Date().toISOString(), pending: true },
    ]);
    this.sending.set(true);
    try {
      const reply = await this.api.sendMessage(this.sessionId, message, this.language());
      this.applyReply(reply, pendingId, userId);
    } catch (e) {
      this.messages.update((m) =>
        m.map((x) => (x.id === pendingId ? { ...x, pending: false, error: true, content: errorMessage(e) } : x)),
      );
    } finally {
      this.sending.set(false);
    }
  }

  private applyReply(reply: AdvisorReply, pendingId: string, userId: string): void {
    const g = reply.guardrails;
    const flags = [
      ...g.inputFlags.map((f) => `blocked: ${f.replaceAll('_', ' ')}`),
      ...g.redactions.map((r) => `${r.toUpperCase()} redacted`),
      ...(g.outputIssues.includes('ungrounded_numbers') ? ['AI answer failed number check - showing verified figures'] : []),
      ...(g.outputIssues.includes('approval_promise') ? ['AI answer removed (approval claim)'] : []),
      ...(g.outputIssues.includes('llm_unavailable') ? ['AI unavailable - rules engine answer'] : []),
    ];
    this.messages.update((m) =>
      m.map((x) =>
        x.id === userId
          ? { ...x, content: reply.userMessage.content } // show the redacted version that was actually stored
          : x.id === pendingId
          ? { ...reply.message, source: reply.source, flags, disclaimer: reply.disclaimer, traceId: reply.traceId }
          : x,
      ),
    );
    this.profile.set(reply.profile);
    this.result.set({ ...reply.recommendations, disclaimer: reply.disclaimer });
    if (reply.comparison?.length) {
      this.comparison.set(reply.comparison);
      this.selectedForCompare.set(reply.comparison.map((c) => c.productId));
    }
    if (this.readAloud()) this.speech.speak(reply.message.content, this.language());
  }

  download(format: 'html' | 'md'): void {
    this.api.downloadSummary(format, this.language()).catch((e) => this.error.set(errorMessage(e)));
  }
}
