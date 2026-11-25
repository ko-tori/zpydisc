# Zhaopengyou (找朋友) — Discord Activity

A clean TypeScript monorepo implementing **Zhaopengyou (Finding Friends / Shengji)** as a Discord Embedded Activity.

## Architecture

- `packages/shared` (`@zpy/shared`): Pure TypeScript Zhaopengyou rules engine (`cards`, `play`, `matcher`, `gameState`, `bot`, `protocol`) with Vitest unit tests.
- `packages/server` (`@zpy/server`): Express + WebSocket (`ws`) server handling Discord OAuth2 `/api/token` exchange, one room per Discord `channelId`, per-player private hand broadcasting, and bot turns.
- `packages/client` (`@zpy/client`): React + Vite frontend using `@discord/embedded-app-sdk` with automatic local multi-tab mock mode when opened outside Discord.

## Quick Start (Local Development)

```bash
npm install
npm run build
npm test
npm run dev
```

Open `http://localhost:5173` in your browser:
- Add bots directly in the lobby (`+ Add Bot`) to test solo, or
- Open multiple browser tabs with `?user_id=alice`, `?user_id=bob`, etc. (all default to `channel_id=local-table`).

## Running Inside Discord

1. Copy `.env.example` to `.env` and fill in `VITE_CLIENT_ID` and `CLIENT_SECRET` from the Discord Developer Portal.
2. Start the dev servers (`npm run dev`) and expose port `5173` via `npm run tunnel` (`cloudflared`).
3. Configure your Discord Application's Activity URL Mapping to point `/` to your tunnel URL.

## Legacy Branch

The previous Colyseus-based implementation is preserved on the `legacy` branch.
