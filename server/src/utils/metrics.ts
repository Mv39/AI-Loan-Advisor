/**
 * Dependency-free Prometheus metrics (text exposition format 0.0.4).
 * Enough for counters/gauges/histograms with labels; swap for prom-client or
 * OpenTelemetry metrics in production without touching call sites.
 */

type Labels = Record<string, string>;
const key = (labels: Labels) =>
  Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/["\\\n]/g, '_')}"`)
    .join(',');

abstract class Metric {
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: 'counter' | 'gauge' | 'histogram',
  ) {}
  abstract render(): string[];
  header() {
    return [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} ${this.type}`];
  }
}

export class Counter extends Metric {
  private values = new Map<string, number>();
  constructor(name: string, help: string) {
    super(name, help, 'counter');
  }
  inc(labels: Labels = {}, by = 1) {
    const k = key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  get(labels: Labels = {}) {
    return this.values.get(key(labels)) ?? 0;
  }
  render() {
    return [...this.values].map(([k, v]) => `${this.name}${k ? `{${k}}` : ''} ${v}`);
  }
}

export class Gauge extends Metric {
  private values = new Map<string, number>();
  constructor(name: string, help: string) {
    super(name, help, 'gauge');
  }
  set(value: number, labels: Labels = {}) {
    this.values.set(key(labels), value);
  }
  get(labels: Labels = {}) {
    return this.values.get(key(labels)) ?? 0;
  }
  render() {
    return [...this.values].map(([k, v]) => `${this.name}${k ? `{${k}}` : ''} ${v}`);
  }
}

export class Histogram extends Metric {
  private series = new Map<string, { buckets: number[]; sum: number; count: number }>();
  constructor(
    name: string,
    help: string,
    private readonly bounds: number[],
  ) {
    super(name, help, 'histogram');
  }
  observe(value: number, labels: Labels = {}) {
    const k = key(labels);
    let s = this.series.get(k);
    if (!s) {
      s = { buckets: this.bounds.map(() => 0), sum: 0, count: 0 };
      this.series.set(k, s);
    }
    this.bounds.forEach((b, i) => {
      if (value <= b) s!.buckets[i]++;
    });
    s.sum += value;
    s.count++;
  }
  count(labels: Labels = {}) {
    return this.series.get(key(labels))?.count ?? 0;
  }
  render() {
    const out: string[] = [];
    for (const [k, s] of this.series) {
      const sep = k ? `${k},` : '';
      this.bounds.forEach((b, i) => out.push(`${this.name}_bucket{${sep}le="${b}"} ${s.buckets[i]}`));
      out.push(`${this.name}_bucket{${sep}le="+Inf"} ${s.count}`);
      out.push(`${this.name}_sum${k ? `{${k}}` : ''} ${Number(s.sum.toFixed(6))}`);
      out.push(`${this.name}_count${k ? `{${k}}` : ''} ${s.count}`);
    }
    return out;
  }
}

const LATENCY_BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20];

export const metrics = {
  httpRequests: new Counter('http_requests_total', 'HTTP requests by method, route and status'),
  httpDuration: new Histogram('http_request_duration_seconds', 'HTTP request latency', LATENCY_BUCKETS),
  llmRequests: new Counter('llm_requests_total', 'LLM calls by outcome (ok|error|short_circuited)'),
  llmDuration: new Histogram('llm_request_duration_seconds', 'LLM call latency', LATENCY_BUCKETS),
  llmCircuitState: new Gauge('llm_circuit_state', 'LLM circuit breaker state: 0=closed 1=open 2=half_open'),
  advisorReplies: new Counter('advisor_replies_total', 'Advisor replies by source (llm|rules) and intent'),
  guardrailEvents: new Counter('guardrail_events_total', 'Guardrail triggers by stage and type'),
};

export function renderMetrics(): string {
  const lines: string[] = [];
  for (const m of Object.values(metrics) as Metric[]) lines.push(...m.header(), ...m.render());
  lines.push(
    '# HELP process_uptime_seconds Process uptime',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${Math.round(process.uptime())}`,
    '# HELP process_resident_memory_bytes Resident memory',
    '# TYPE process_resident_memory_bytes gauge',
    `process_resident_memory_bytes ${process.memoryUsage().rss}`,
  );
  return lines.join('\n') + '\n';
}
