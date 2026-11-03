# MSP CRM — Frontend

Next.js (App Router) + Tailwind + shadcn/ui. API: [msp-backend](https://github.com/Kishan-841/msp-backend).

## Local development

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
npm run dev                  # http://localhost:3000
```

## Deploy (Vercel)

Import this repo in Vercel (framework: Next.js, defaults are fine) and set

```
NEXT_PUBLIC_API_URL=https://<your-api-domain>/api/v1
```

Add the Vercel URL to the backend's `CORS_ORIGIN` (and `COOKIE_SAMESITE=none`) — see the backend's DEPLOY.md.
