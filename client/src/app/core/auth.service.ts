import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface Session {
  token: string;
  expiresAt: number;
  displayName: string;
}

const KEY = 'loan-advisor.session';

/**
 * Token is kept in sessionStorage (cleared when the tab closes) rather than
 * localStorage. In production we would use an httpOnly, Secure, SameSite
 * cookie issued by the identity provider so JS never touches the token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = signal<Session | null>(this.restore());

  readonly isLoggedIn = computed(() => {
    const s = this.session();
    return !!s && s.expiresAt > Date.now();
  });
  readonly displayName = computed(() => this.session()?.displayName ?? '');

  token(): string | null {
    const s = this.session();
    return s && s.expiresAt > Date.now() ? s.token : null;
  }

  async login(username: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string; expiresIn: number; user: { displayName: string } }>('/api/auth/demo-login', { username }),
    );
    const s: Session = { token: res.token, expiresAt: Date.now() + res.expiresIn * 1000, displayName: res.user.displayName };
    this.session.set(s);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable - keep in memory only */
    }
  }

  logout(): void {
    this.session.set(null);
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  private restore(): Session | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      const s = raw ? (JSON.parse(raw) as Session) : null;
      return s && s.expiresAt > Date.now() ? s : null;
    } catch {
      return null;
    }
  }
}
