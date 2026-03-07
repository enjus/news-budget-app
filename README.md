# News Budget App

A news budget management tool for tracking editorial stories and videos across daily, enterprise, edition, and shelved views with drag-and-drop scheduling.

## Tech Stack

- **Next.js 16** (App Router, Turbopack) + React 19
- **Prisma 5 + PostgreSQL** (tested on Neon)
- **next-auth v4** — credentials-based auth with role support
- **SWR** for client-side data fetching
- **@dnd-kit** for drag-and-drop
- **shadcn/ui** + Tailwind 4

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env` with your PostgreSQL connection string and a NextAuth secret:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="$(openssl rand -hex 32)"
```

### 3. Set up the database

```bash
npx prisma migrate dev
npx prisma db seed
```

The seed creates 9 demo user accounts. All use the password **`newsbudget2026`**:

| Email | Role |
|-------|------|
| admin@newsroom.com | Admin |
| director@newsroom.com | Admin |
| editor@newsroom.com | Editor |
| reporter@newsroom.com | Editor |
| videographer@newsroom.com | Editor |
| photographer@newsroom.com | Editor |
| designer@newsroom.com | Editor |
| social@newsroom.com | Editor |
| audience@newsroom.com | Editor |

> These are demo credentials. Change them or replace the seed before any real deployment.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with any seed account.

## Key Commands

```bash
npm run dev              # Dev server at http://localhost:3000
npm run build            # Production build
npm run lint             # ESLint
npx prisma studio        # Database browser UI
npx prisma db seed       # Re-seed (clears all data)
npx prisma migrate dev   # Apply schema changes
```

## Deployment

The app is designed for Vercel + Neon (PostgreSQL). Set the three environment variables (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`) in your Vercel project settings, then deploy.
