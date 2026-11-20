# Rasam Sanketh Tracker

A responsive productivity dashboard built with React, Vite, and Express. It includes tasks, goals, notes, a date-based calendar, and an activity/report view.

## Requirements

- Node.js 20 or newer
- npm

The development backend stores data in `server/data/store.json`; no MongoDB service is needed locally. When `MONGODB_URI` is set, the API uses MongoDB instead. Passwords are hashed and API requests use JWT bearer tokens.

## Run locally

Install dependencies once:

```powershell
cd client
npm install
cd ..\server
npm install
```

In one terminal, start the API:

```powershell
cd server
npm run dev
```

In a second terminal, start the web app:

```powershell
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The app opens directly into an anonymous guest workspace; no signup or login is required. Each browser gets its own workspace token. Clearing browser storage loses access to that guest workspace.

The API health check is at [http://localhost:5000/api/health](http://localhost:5000/api/health).

Optional server settings can be placed in `server/.env`:

```text
PORT=5000
JWT_SECRET=<a-long-random-secret>
```

For Vercel deployment with persistent MongoDB storage, follow [DEPLOY.md](./DEPLOY.md).
