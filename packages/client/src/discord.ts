import { DiscordSDK } from '@discord/embedded-app-sdk';

export interface DiscordIdentity {
  userId: string;
  name: string;
  avatarUri: string;
  channelId: string;
  isEmbedded: boolean;
}

const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get('frame_id') != null;

function getLocalParam(key: string, defaultValue?: string): string {
  const fromQuery = queryParams.get(key);
  if (fromQuery) return fromQuery;
  const fromStorage = sessionStorage.getItem(key);
  if (fromStorage) return fromStorage;
  const value = defaultValue ?? `player_${Math.random().toString(36).slice(2, 7)}`;
  sessionStorage.setItem(key, value);
  return value;
}

let cachedIdentityPromise: Promise<DiscordIdentity> | null = null;

export function initDiscordIdentity(onStatus?: (msg: string) => void): Promise<DiscordIdentity> {
  if (!cachedIdentityPromise) {
    cachedIdentityPromise = createDiscordIdentity(onStatus).catch((err) => {
      cachedIdentityPromise = null;
      throw err;
    });
  }
  return cachedIdentityPromise;
}

async function createDiscordIdentity(onStatus?: (msg: string) => void): Promise<DiscordIdentity> {
  if (!isEmbedded) {
    const userId = getLocalParam('user_id');
    const name = queryParams.get('name') ?? userId;
    const channelId = getLocalParam('channel_id', 'local-table');
    return {
      userId,
      name,
      avatarUri: '',
      channelId,
      isEmbedded: false,
    };
  }

  const clientId = import.meta.env.VITE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing VITE_CLIENT_ID in .env (restart dev server after adding .env).');
  }

  onStatus?.('Waiting for Discord SDK ready...');
  const discordSdk = new DiscordSDK(clientId);
  await discordSdk.ready();

  onStatus?.('Authorizing with Discord...');
  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });

  onStatus?.('Exchanging OAuth2 token...');
  const tokenRes = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '');
    throw new Error(`Token exchange failed (${tokenRes.status}): ${detail}`);
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  onStatus?.('Authenticating with Discord...');
  const auth = await discordSdk.commands.authenticate({ access_token });
  const user = auth.user;

  const avatarUri = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 5n)}.png`;

  return {
    userId: user.id,
    name: user.global_name || user.username,
    avatarUri,
    channelId: discordSdk.channelId ?? 'discord-channel',
    isEmbedded: true,
  };
}
