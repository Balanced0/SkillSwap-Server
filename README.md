# SkillSwap API

Express + MongoDB API for SkillSwap. It stores only member-created profiles, skill listings, sessions, reviews, and credit transactions.

## Run locally

1. Copy `.env.example` to `.env`, set a strong `BETTER_AUTH_SECRET`, and add your Google OAuth web client credentials.
2. In Google Cloud Console, add `http://localhost:4000/api/auth/callback/google` as the local redirect URI. Use the same path on the deployed API domain in production.
3. Point `MONGODB_URI` to MongoDB configured as a replica set. MongoDB transactions are deliberately used when both members complete a session so the credit debit, credit, session update, and transaction records succeed or fail together.
4. Install and start the API:

```bash
npm install
npm run dev
```

The server starts at `http://localhost:4000`; the health endpoint is `GET /api/health`.

For a local single-node replica set, initialize MongoDB with `--replSet rs0`, then run `rs.initiate()` once in `mongosh` and use a URI such as `mongodb://127.0.0.1:27017/skillswap?replicaSet=rs0`.

## API areas

- Better Auth handles Google-only SSO at `/api/auth/*`; SkillSwap profile endpoints live at protected `/api/members/me`.
- Public `/api/listings` search/filter/pagination and protected listing CRUD.
- Protected session requests, accept/decline/cancel actions, and two-party completion confirmation.
- Ledger, platform statistics, dashboard aggregates, and post-session reviews.

## Validate

```bash
npm run typecheck
npm run build
```
