import { Component, inject } from '@angular/core';
import { AuthService } from './core/auth.service';
import { AdvisorComponent } from './features/advisor/advisor';
import { LoginComponent } from './features/login/login';

@Component({
  selector: 'app-root',
  imports: [LoginComponent, AdvisorComponent],
  template: `@if (auth.isLoggedIn()) { <app-advisor /> } @else { <app-login /> }`,
})
export class App {
  readonly auth = inject(AuthService);
}
