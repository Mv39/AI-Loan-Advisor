import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows the persona login when signed out', async () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/demo-users').flush([{ username: 'priya', displayName: 'Priya (Salaried)', persona: 'IT professional' }]);
    await new Promise((r) => setTimeout(r)); // let the awaited HTTP promise resolve
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('LoanSense');
    expect(el.querySelector('.persona')?.textContent).toContain('Priya (Salaried)');
  });
});
