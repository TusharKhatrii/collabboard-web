# CollabBoard

A real-time collaborative whiteboard — sketch, plan, and think out loud together, live, with no setup. Built on [Excalidraw](https://github.com/excalidraw/excalidraw), with a custom Socket.io backend for presence, drawing sync, and live cursors.

**Live app:** `LIVE_LINK_PLACEHOLDER`

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS**
- **Excalidraw** — canvas/whiteboard UI
- **Socket.io Client** — real-time communication
- **Docker** — containerized local builds

## Features

- Create a room and get a shareable invite link instantly
- Join a room via a shared access code
- Live collaborative drawing — every stroke syncs in real time, with conflict-safe merging so simultaneous edits never overwrite each other
- Live presence — see who else is in the room
- Named, colored collaborator cursors, Google Docs–style
- Light/dark theme toggle

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- The [collabboard-api](https://github.com/YOUR-USERNAME/collabboard-api) backend running (locally or deployed)

### Local Setup

```bash
pnpm install
```

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

Run the dev server:

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Running with Docker

Build the image (env values are baked in at build time, not runtime):

```bash
docker build \
  --build-arg NEXT_PUBLIC_WS_URL=http://localhost:3001 \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
  -t collabboard-web .
```

Run the container:

```bash
docker run -p 3000:3000 collabboard-web
```

## Deployment

Deployed on [Vercel](https://vercel.com), auto-deploying from the `main` branch.

Required environment variables on Vercel:

```
NEXT_PUBLIC_API_URL=<deployed backend URL>
NEXT_PUBLIC_WS_URL=<deployed backend URL>
```

## Related

- Backend repo: [collabboard-api](https://github.com/YOUR-USERNAME/collabboard-api)