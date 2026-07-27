# Agent Studio

Agent Studio is a TanStack Start application exported from Lovable and prepared for local development.

## Local setup

Requirements: Node.js 22 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If that port is busy, Vite prints the port it selected in the terminal.

## Local project mode

Projects and uploaded assets are stored in this browser's IndexedDB database. They persist across refreshes, but are not synced to Supabase or shared across browsers. Clearing browser site data removes them.

Supabase is not required to browse, create, or edit local projects. The remaining service keys in `.env.local` are optional and enable the matching generation or export features.

Keep service keys only in `.env.local`, for example `PIKA_API_KEY=...`. That file is ignored by Git, and keys without a `VITE_` prefix stay on the server side of the local app. Restart the development server after changing it.

For the Vercel deployment, add `PIKA_API_KEY` in Project Settings → Environment Variables for both Preview and Production. `PIKA_API_BASE_URL` is optional and defaults to `https://api.dev.pika.art`.

## Commands

```bash
npm run dev        # Start the local development server
npm run build      # Create a production build
npm run preview    # Preview the production build
npm run typecheck  # Check TypeScript types
npm run lint       # Run ESLint
npm run format     # Format the project
```
