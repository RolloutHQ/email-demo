# Email Demo

This project is a minimal Rollout Universal Email demo. It provides a tiny Sinatra backend to mint Rollout tokens and a React (Vite) frontend that mounts the Rollout Link UI and demonstrates reading an inbox and replying in-thread via the Universal Email API.

## Project Layout

- `backend/` – Sinatra API service that mints tokens for the frontend
- `frontend/` – React app bootstrapped with Vite and configured to proxy API calls to the backend during development
- `backend/.env.example` – template for environment variables required to talk to Rollout

## Prerequisites

- Ruby 3.1+ with Bundler
- Node.js 18+ with npm

## Backend (Sinatra)

```bash
cd backend
bundle install
# export $(grep -v '^#' .env | xargs) # optional helper once you copy .env.example -> .env
export ROLLOUT_CLIENT_ID=your_client_id
export ROLLOUT_CLIENT_SECRET=your_client_secret
bundle exec ruby app.rb
```

The server listens on `http://127.0.0.1:4567` by default. Available routes:

- `GET /api/health` – health check
- `GET /api/rollout/token` – returns a short-lived JWT for authenticating Rollout Link

### Notes

- The backend uses Puma and exposes only health and token endpoints (trimmed for the email demo).

## Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Vite serves the app on `http://127.0.0.1:5173` by default and proxies `/api` requests to the backend. You can override the proxy target by setting the `BACKEND_URL` environment variable when running Vite, or set `VITE_API_BASE_URL` to make the frontend call a different API URL directly.

The frontend fetches credentials directly from Rollout's universal API when booting; override `VITE_ROLLOUT_CREDENTIALS_URL` if you need to target a different environment.

## Developing Together

1. Start the backend server (`bundle exec ruby app.rb`).
   - Ensure the environment variables `ROLLOUT_CLIENT_ID` and `ROLLOUT_CLIENT_SECRET` are set before launching.
   - Optionally override `ROLLOUT_API_BASE_URL` if you need to point at a different Rollout environment.
2. Start the frontend dev server (`npm run dev`).
3. Visit `http://127.0.0.1:5173` in your browser. The frontend requests a token from `/api/rollout/token`, mounts the Rollout Link UI (Gmail in this demo), lists inbox messages, and lets you reply. When replying, it will hydrate an existing `threadId` or create a thread via `POST /email-threads`, then send the reply to `POST /emailMessages` with that `threadId`.

This repo intentionally avoids unrelated examples to stay focused on the email demo.
