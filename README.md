# Email Demo

This project is the starting point for the Rollout email demo. It reuses the Smart List demo scaffolding so we have a Sinatra backend that can mint Rollout tokens and a React (Vite) frontend that already knows how to mount the Rollout Link UI. We will trim and customize it for the email experience next.

## Project Layout

- `backend/` – Sinatra API service with a couple of placeholder endpoints
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
3. Visit `http://127.0.0.1:5173` in your browser. The frontend will request a token from `/api/rollout/token`, mount the Rollout Link UI (currently scoped to the Follow Up Boss Advanced connector), and surface the existing smart list and person helpers that shipped with the original demo.

Feel free to replace or remove the smart list-specific pieces as you build out the email demo functionality.
