# News Budget App

A news budget management tool for tracking editorial stories and videos across daily, enterprise, edition, and shelved views with drag-and-drop scheduling.

## Tech Stack

- **Next.js 16** (App Router, Turbopack) + React 19
- **Prisma 5 + PostgreSQL** (tested on Neon)
- **next-auth v4** — credentials + Azure AD SSO auth with role support
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

## Azure AD SSO (Optional)

The app supports Microsoft Entra ID (Azure AD) single sign-on alongside email/password login. When configured, a "Sign in with Microsoft" button appears on the login page.

SSO users are auto-provisioned as `VIEWER` if they belong to a configured Azure AD security group. Admins can promote roles via `/admin/users`. Pre-provisioned users (created by an admin with a matching email) are matched automatically on first SSO sign-in.

To enable, set four additional environment variables:

```env
AZURE_AD_CLIENT_ID=...
AZURE_AD_CLIENT_SECRET=...
AZURE_AD_TENANT_ID=...
AZURE_AD_ALLOWED_GROUP_ID=...
```

See [`docs/azure-sso-setup.md`](docs/azure-sso-setup.md) for full Azure Portal setup instructions.

## Deployment

### Vercel (recommended)

Set the environment variables (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, plus Azure AD vars if using SSO) in your Vercel project settings, then deploy.

### AWS / Linux VPS

See [`docs/aws-vps-deployment.md`](docs/aws-vps-deployment.md) for a full guide covering EC2 setup, Nginx, SSL, PM2, and deploy scripts.
