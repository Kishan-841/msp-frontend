import { io, Socket } from 'socket.io-client';
import api from '@/lib/axios';

let socket: Socket | null = null;

/**
 * One socket per signed-in tab. The token is read on EVERY (re)connect — access tokens
 * expire after 15 min, so a fixed token would make every later reconnect fail and
 * silently stop notifications. If the server still rejects us, refresh the token
 * (the axios interceptor does that on a 401) and try again.
 */
export function connectSocket() {
  if (socket) return socket;

  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
    'http://localhost:5001';

  socket = io(baseUrl, {
    auth: (cb) => cb({ token: localStorage.getItem('accessToken') }),
    reconnectionDelayMax: 10000,
  });

  socket.on('connect_error', async (err) => {
    if (!/token|auth/i.test(err.message)) return; // network errors: socket.io keeps retrying itself
    try {
      await api.get('/auth/me'); // 401 → interceptor refreshes and stores a new token
      socket?.connect();
    } catch {
      /* refresh failed — the auth provider will send the user to login */
    }
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
