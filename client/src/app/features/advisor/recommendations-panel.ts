import { Component, inject } from '@angular/core';
import { AdvisorStore } from '../../core/advisor.store';
import { InrPipe, TenurePipe } from '../../shared/format';

@Component({
  selector: 'app-recommendations-panel',
  imports: [InrPipe, TenurePipe],
  template: `
    <section class="panel recs" aria-labelledby="recs-title">
      <div class="panel-head">
        <h2 id="recs-title">Your options</h2>
        <div class="actions">
          <button class="btn sm" (click)="store.download('html')" title="Printable summary (save as PDF from the browser)">⬇ Summary</button>
          <button class="btn sm ghost" (click)="store.download('md')">.md</button>
        </div>
      </div>

      @if (store.loadingRecs() && !store.result()) { <p class="muted">Calculating…</p> }

      @for (r of store.recommendations(); track r.productId) {
        <article class="rec" [class.top]="r.rank === 1">
          <header>
            <div>
              <span class="rank">#{{ r.rank }}</span>
              <h3>{{ r.productName }}</h3>
            </div>
            <span class="pill" [class]="r.status">{{ r.status === 'eligible' ? 'Likely eligible' : 'Eligible with changes' }}</span>
          </header>
          <div class="emi-row">
            <div><span class="label">Est. EMI</span><span class="big">{{ r.emi.emi | inr }}</span><span class="label">/month</span></div>
            <div class="sub">{{ r.emi.principal | inr }} · {{ r.emi.tenureMonths | tenure }} · {{ r.annualRatePct }}% p.a.</div>
          </div>
          <dl class="kv">
            <dt>Total interest</dt><dd>{{ r.emi.totalInterest | inr }}</dd>
            <dt>Processing fee</dt><dd>{{ r.emi.processingFee | inr }}</dd>
            <dt>Total repayment</dt><dd>{{ r.emi.totalRepayment | inr }}</dd>
            <dt title="Annual Percentage Rate including fees">APR (incl. fees)</dt><dd>{{ r.emi.aprPct }}%</dd>
          </dl>
          <details>
            <summary>Why it fits & watch-outs</summary>
            <ul class="pros">@for (w of r.whyThisFits; track $index) { <li>{{ w }}</li> }</ul>
            <ul class="cons">@for (w of r.watchOuts; track $index) { <li>{{ w }}</li> }</ul>
          </details>
          <details>
            <summary>Compare tenures</summary>
            <table class="tbl">
              <thead><tr><th>Tenure</th><th>EMI</th><th>Interest</th><th>EMIs/income</th></tr></thead>
              <tbody>
                @for (o of r.tenureOptions; track o.tenureMonths) {
                  <tr [class.sel]="o.tenureMonths === r.emi.tenureMonths" [class.over]="!o.affordable">
                    <td>{{ o.tenureMonths | tenure }}</td><td>{{ o.emi | inr }}</td><td>{{ o.totalInterest | inr }}</td>
                    <td>{{ o.foirAfterLoanPct }}%{{ o.affordable ? '' : ' ⚠' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </details>
          <label class="check"><input type="checkbox" [checked]="store.selectedForCompare().includes(r.productId)" (change)="store.toggleCompare(r.productId)" /> Add to comparison</label>
        </article>
      } @empty {
        @if (store.result()) { <p class="alert">No product fits the current details. See reasons below, or try a smaller amount, longer tenure, or adding collateral.</p> }
      }

      @if (store.selectedForCompare().length >= 2) {
        <button class="btn block" (click)="store.runCompare()">Compare {{ store.selectedForCompare().length }} products</button>
      }

      @if (store.comparison(); as rows) {
        <div class="compare">
          <h3>Side-by-side</h3>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th></th>@for (c of rows; track c.productId) { <th>{{ c.product }}</th> }</tr></thead>
              <tbody>
                @for (f of compareFields; track f.key) {
                  <tr><th>{{ f.label }}</th>@for (c of rows; track c.productId) { <td>{{ $any(c)[f.key] ?? '-' }}</td> }</tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (store.result()?.tenureTradeoff?.length) {
        <div class="tradeoff">
          <h3>Shorter vs longer tenure</h3>
          <ul>@for (t of store.result()!.tenureTradeoff; track $index) { <li>{{ t }}</li> }</ul>
        </div>
      }

      @if (store.result()?.notEligible?.length) {
        <details class="not-eligible">
          <summary>Not suitable right now ({{ store.result()!.notEligible.length }})</summary>
          <ul>@for (n of store.result()!.notEligible; track n.productId) { <li><strong>{{ n.productName }}:</strong> {{ n.reasons.join('; ') }}</li> }</ul>
        </details>
      }

      <p class="fineprint">Indicative estimates, not a loan offer. Final approval, rate and amount depend on underwriting and verification.</p>
    </section>
  `,
})
export class RecommendationsPanelComponent {
  readonly store = inject(AdvisorStore);
  readonly compareFields = [
    { key: 'status', label: 'Status' },
    { key: 'annualRate', label: 'Rate' },
    { key: 'loanAmount', label: 'Amount' },
    { key: 'tenure', label: 'Tenure' },
    { key: 'emi', label: 'EMI' },
    { key: 'totalInterest', label: 'Interest' },
    { key: 'processingFee', label: 'Fee' },
    { key: 'totalRepayment', label: 'Total repay' },
    { key: 'aprInclFees', label: 'APR' },
  ];
}
