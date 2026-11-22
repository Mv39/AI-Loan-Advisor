import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DemoUser } from '../../core/models';

@Component({
  selector: 'app-login',
  template: `
    <main class="login">
      <section class="login-card">
        <div class="brand brand-lg"><span class="logo">₹</span> LoanSense</div>
        <p class="muted">AI loan advisor demo. Pick a mock borrower to sign in - each user only ever sees their own profile and chats.</p>
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
        <div class="persona-list">
          @for (u of users(); track u.username) {
            <button class="persona" (click)="login(u.username)" [disabled]="busy()">
              <strong>{{ u.displayName }}</strong>
              <span>{{ u.persona }}</span>
            </button>
          } @empty {
            @if (!error()) { <p class="muted">Loading demo users…</p> }
          }
        </div>
        <p class="fineprint">Authentication is mocked (no password) but the API issues and verifies real signed, expiring JWTs.</p>
      </section>
    </main>
  `,
})
export class LoginComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly users = signal<DemoUser[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.users.set(await this.api.demoUsers());
    } catch {
      this.error.set('Cannot reach the API. Is the server running on port 3000?');
    }
  }

  async login(username: string) {
    this.busy.set(true);
    try {
      await this.auth.login(username);
    } catch {
      this.error.set('Login failed');
    } finally {
      this.busy.set(false);
    }
  }
}
