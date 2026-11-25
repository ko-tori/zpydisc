import { DiscordSDK, DiscordSDKMock } from '@discord/embedded-app-sdk';

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

export async function initDiscordIdentity(): Promise<DiscordIdentity> {
  if (!isEmbedded) {
    const userId = getLocalParam('user_id');
    const name = queryParams.get('name') ?? userId;
    const channelId = getLocalParam('channel_id', 'local-table');
    // Instantiate mock SDK for local parity
    const mock = new DiscordSDKMock(
      import.meta.env.VITE_CLIENT_ID ?? 'local-dev-client',
      'local-guild',
      channelId,
      'local-location'
    );
    await mock.ready();
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
    throw new Error('Missing VITE_CLIENT_ID environment variable.');
  }

  const discordSdk = new DiscordSDK(clientId);
  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });

  const tokenRes = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!tokenRes.ok) {
    throw new Error('Failed to exchange Discord OAuth2 token.');
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
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
