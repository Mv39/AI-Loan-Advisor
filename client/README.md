# LoanSense client (Angular 22)

Standalone components, signals-based store (`core/advisor.store.ts`), zoneless change detection.

```bash
npm ci
npm start      # http://localhost:4200, proxies /api -> http://localhost:3000 (proxy.conf.json)
npm test       # Vitest unit tests
npx ng build   # production build -> dist/client/browser (served by the API in production)
```

See the root README for architecture and design decisions.
