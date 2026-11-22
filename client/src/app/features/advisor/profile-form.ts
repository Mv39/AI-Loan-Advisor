import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AdvisorStore } from '../../core/advisor.store';
import { BorrowerProfile, EMPLOYMENT, EmiResult, PURPOSES } from '../../core/models';
import { InrPipe } from '../../shared/format';

@Component({
  selector: 'app-profile-form',
  imports: [ReactiveFormsModule, InrPipe],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="panel" aria-labelledby="profile-title">
      <h2 id="profile-title">Your borrowing profile</h2>
      <div class="grid2">
        <label>Loan amount (₹)
          <input type="number" formControlName="requestedAmount" min="1000" step="1000" />
        </label>
        <label>Preferred tenure (months)
          <input type="number" formControlName="preferredTenureMonths" min="1" max="360" />
        </label>
        <label class="span2">Purpose
          <select formControlName="purpose">
            @for (p of purposes; track p.value) { <option [value]="p.value">{{ p.label }}</option> }
          </select>
        </label>
        <label>Monthly net income (₹)
          <input type="number" formControlName="monthlyIncome" min="0" step="1000" />
        </label>
        <label>Existing EMIs (₹/month)
          <input type="number" formControlName="existingEmi" min="0" step="500" />
        </label>
        <label class="span2">Employment type
          <select formControlName="employmentType">
            @for (e of employment; track e.value) { <option [value]="e.value">{{ e.label }}</option> }
          </select>
        </label>
        @if (form.value.employmentType === 'business_owner' || form.value.employmentType === 'self_employed') {
          <label class="span2">Business vintage (years)
            <input type="number" formControlName="businessVintageYears" min="0" max="100" />
          </label>
        }
        <fieldset class="span2 risk">
          <legend>Credit risk profile</legend>
          @for (r of ['low', 'medium', 'high']; track r) {
            <label class="radio"><input type="radio" formControlName="riskProfile" [value]="r" /> {{ r }}</label>
          }
        </fieldset>
        <label class="check span2"><input type="checkbox" formControlName="hasExistingLoanWithUs" /> I have an active loan with this lender</label>
        <label class="check span2"><input type="checkbox" formControlName="hasCollateral" /> I can offer collateral (property / FD / gold)</label>
      </div>
      @if (form.invalid && form.touched) { <p class="alert">Please check the highlighted fields.</p> }
      <button type="submit" class="btn primary block" [disabled]="form.invalid || saving()">
        {{ saving() ? 'Updating…' : 'Update recommendations' }}
      </button>
    </form>

    <details class="panel calc">
      <summary><h2>Quick EMI calculator</h2></summary>
      <div class="grid3">
        <label>Amount <input type="number" #a value="500000" min="1000" /></label>
        <label>Rate % p.a. <input type="number" #r value="12" step="0.1" min="0" /></label>
        <label>Months <input type="number" #n value="36" min="1" max="360" /></label>
      </div>
      <button type="button" class="btn block" (click)="calc(+a.value, +r.value, +n.value)">Calculate</button>
      @if (emi(); as e) {
        <dl class="kv">
          <dt>EMI</dt><dd>{{ e.emi | inr }}</dd>
          <dt>Total interest</dt><dd>{{ e.totalInterest | inr }}</dd>
          <dt>Total repayment</dt><dd>{{ e.totalRepayment | inr }}</dd>
        </dl>
      }
      @if (calcError()) { <p class="alert">{{ calcError() }}</p> }
    </details>
  `,
})
export class ProfileFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  readonly store = inject(AdvisorStore);
  readonly purposes = PURPOSES;
  readonly employment = EMPLOYMENT;
  readonly saving = signal(false);
  readonly emi = signal<EmiResult | null>(null);
  readonly calcError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    requestedAmount: [0, [Validators.required, Validators.min(1000), Validators.max(100_000_000)]],
    preferredTenureMonths: [12, [Validators.required, Validators.min(1), Validators.max(360)]],
    purpose: ['other', Validators.required],
    monthlyIncome: [0, [Validators.required, Validators.min(0)]],
    existingEmi: [0, [Validators.required, Validators.min(0)]],
    employmentType: ['salaried' as BorrowerProfile['employmentType'], Validators.required],
    riskProfile: ['medium' as BorrowerProfile['riskProfile'], Validators.required],
    hasExistingLoanWithUs: [false],
    hasCollateral: [false],
    businessVintageYears: [0, [Validators.min(0), Validators.max(100)]],
  });

  constructor() {
    // Keep the form in sync when the chat updates the profile ("I need 3 lakh for 2 years").
    effect(() => {
      const p = this.store.profile();
      if (p) this.form.patchValue({ ...p, businessVintageYears: p.businessVintageYears ?? 0 }, { emitEvent: false });
    });
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue();
    const needsVintage = v.employmentType === 'business_owner' || v.employmentType === 'self_employed';
    const { businessVintageYears, ...rest } = v;
    await this.store.saveProfile({ ...rest, ...(needsVintage ? { businessVintageYears } : {}) });
    this.saving.set(false);
  }

  async calc(principal: number, rate: number, months: number) {
    this.calcError.set(null);
    try {
      this.emi.set(await this.api.emi(principal, rate, Math.round(months)));
    } catch {
      this.emi.set(null);
      this.calcError.set('Enter amount > 0, rate 0-60% and 1-360 months.');
    }
  }
}
