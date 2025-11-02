# AidJobs

AI-powered job search platform for NGOs/INGOs.

## Project Structure

```
/
├── apps/
│   ├── frontend/        # Next.js (TypeScript, App Router) + Tailwind + shadcn/ui
│   └── backend/         # FastAPI (Python 3.11)
├── packages/
│   ├── ui/              # Shared components/tokens
│   └── lib/             # Shared types/helpers
├── infra/
│   ├── supabase.sql     # Database schema
│   └── seed.sql         # Seed data
├── tests/
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
├── scripts/             # Utility scripts
└── env.example          # Environment variables template
```

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: FastAPI (Python 3.11)
- **Database**: Supabase (PostgreSQL)
- **Search**: Meilisearch
- **AI**: OpenRouter

## Getting Started

1. Copy `env.example` to `.env` and fill in your environment variables
2. Install dependencies: `npm install`
3. Start development servers: `npm run dev`

## Scripts

- `npm run dev` - Start frontend (port 3000) and backend (port 8000)
- `npm run lint` - Lint frontend and backend code
- `npm run test` - Run unit tests

## Environment Setup

See `env.example` for all required environment variables. The application gracefully handles missing environment variables without crashing.

## Features

The platform supports:
- Job search with Meilisearch
- AI-powered job processing via OpenRouter
- Payment processing (PayPal/Razorpay)
- CV upload and processing
- Find & Earn opportunities

Enable/disable features via `AIDJOBS_ENABLE_*` environment variables.
