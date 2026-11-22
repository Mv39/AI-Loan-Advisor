import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  async function signIn() {
    const p = auth.login('priya');
    ctrl.expectOne('/api/auth/demo-login').flush({ token: 'tkn', expiresIn: 600, user: { displayName: 'Priya' } });
    await p;
  }

  it('attaches the bearer token to API calls only', async () => {
    await signIn();
    http.get('/api/me/profile').subscribe();
    expect(ctrl.expectOne('/api/me/profile').request.headers.get('Authorization')).toBe('Bearer tkn');
    http.get('https://example.com/x').subscribe();
    expect(ctrl.expectOne('https://example.com/x').request.headers.has('Authorization')).toBe(false);
  });

  it('signs the user out on 401', async () => {
    await signIn();
    expect(auth.isLoggedIn()).toBe(true);
    http.get('/api/me/profile').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/me/profile').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isLoggedIn()).toBe(false);
  });
});
