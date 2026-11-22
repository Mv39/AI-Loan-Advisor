import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdvisorReply, BorrowerProfile, ComparisonRow, DemoUser, EmiResult, Language, RecommendationResult } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  demoUsers() {
    return firstValueFrom(this.http.get<DemoUser[]>('/api/auth/demo-users'));
  }
  health() {
    return firstValueFrom(this.http.get<{ status: string; llm: string }>('/api/health'));
  }
  getProfile() {
    return firstValueFrom(this.http.get<BorrowerProfile>('/api/me/profile'));
  }
  saveProfile(p: BorrowerProfile) {
    return firstValueFrom(this.http.put<BorrowerProfile>('/api/me/profile', p));
  }
  recommendations() {
    return firstValueFrom(this.http.post<RecommendationResult>('/api/me/recommendations', {}));
  }
  compare(ids: string[]) {
    return firstValueFrom(this.http.get<{ comparison: ComparisonRow[] }>('/api/me/compare', { params: { ids: ids.join(',') } }));
  }
  emi(principal: number, annualRatePct: number, tenureMonths: number, processingFeePct = 0) {
    return firstValueFrom(this.http.post<EmiResult>('/api/emi/calculate', { principal, annualRatePct, tenureMonths, processingFeePct }));
  }
  createSession() {
    return firstValueFrom(this.http.post<{ id: string }>('/api/me/chat/sessions', {}));
  }
  sendMessage(sessionId: string, message: string, language: Language) {
    return firstValueFrom(this.http.post<AdvisorReply>(`/api/me/chat/sessions/${encodeURIComponent(sessionId)}/messages`, { message, language }));
  }
  /** Fetch with the auth header (a plain link can't send it) and save as a file. */
  async downloadSummary(format: 'html' | 'md', language: Language) {
    const res = await firstValueFrom(
      this.http.get('/api/me/summary', { params: { format, language }, responseType: 'blob', observe: 'response' }),
    );
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `loan-summary.${format}`;
    const url = URL.createObjectURL(res.body!);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
