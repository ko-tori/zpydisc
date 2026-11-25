import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { ClientMessage } from '@zpy/shared';
import { RoomManager } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Exchange Discord OAuth2 authorization code for an access token
app.post('/api/token', async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: 'Missing authorization code.' });
    return;
  }

  const clientId = process.env.VITE_CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'Server missing Discord OAuth2 credentials.' });
    return;
  }

  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: text });
      return;
    }

    const data = (await response.json()) as { access_token: string };
    res.json({ access_token: data.access_token });
  } catch (err) {
    console.error('Discord token exchange failed:', err);
    res.status(500).json({ error: 'Token exchange failed.' });
  }
});

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });
const roomManager = new RoomManager();

wss.on('connection', (ws) => {
  let boundChannelId: string | null = null;
  let boundUserId: string | null = null;

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload.' }));
      return;
    }

    if (msg.type === 'join') {
      boundChannelId = msg.channelId || 'default-channel';
      boundUserId = msg.userId;
      const room = roomManager.getOrCreateRoom(boundChannelId);
      room.handleJoin(ws, msg.userId, msg.name, msg.avatarUri);
      return;
    }

    if (!boundChannelId || !boundUserId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Must join a room first.' }));
      return;
    }

    const room = roomManager.getOrCreateRoom(boundChannelId);
    room.handleMessage(boundUserId, msg);
  });

  ws.on('close', () => {
    if (boundChannelId && boundUserId) {
      const room = roomManager.getOrCreateRoom(boundChannelId);
      room.handleDisconnect(boundUserId, ws);
      roomManager.cleanupIfEmpty(boundChannelId);
    }
  });
});

server.listen(port, () => {
  console.log(`Zhaopengyou server listening on http://localhost:${port}`);
});
