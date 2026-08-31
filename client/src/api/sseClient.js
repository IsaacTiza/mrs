import { getToken } from './client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// event type -> Set<handler>
const subscribers = new Map();
let abortController = null;
let reconnectTimer = null;
let reconnectDelayMs = 1000; // resets to 1s on every successful connect, doubles up to MAX on failure
const MAX_RECONNECT_DELAY_MS = 30000;
let manuallyDisconnected = false;

function dispatch(eventType, payload) {
  const handlers = subscribers.get(eventType);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(payload);
    } catch (err) {
      // A subscriber throwing should never take down the shared stream
      // for every other subscriber — log and keep going.
      console.error(`[sse] subscriber for "${eventType}" threw:`, err);
    }
  }
}

// Parses one or more complete `event: x\ndata: y\n\n` frames out of the
// front of `buffer`, dispatching each, and returns whatever incomplete
// tail is left (to be prepended to the next chunk). Also silently skips
// bare comment lines (`: heartbeat`) — those have no `event:`/`data:`
// pair and exist purely to keep the connection alive through proxies.
function consumeFrames(buffer) {
  let idx;
  // eslint-disable-next-line no-cond-assign
  while ((idx = buffer.indexOf('\n\n')) !== -1) {
    const frame = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);

    let eventType = 'message';
    let dataLine = null;
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice('event: '.length);
      else if (line.startsWith('data: ')) dataLine = line.slice('data: '.length);
    }
    if (dataLine === null) continue; // comment-only frame (heartbeat)

    let payload;
    try {
      payload = JSON.parse(dataLine);
    } catch {
      continue; // malformed frame — drop it rather than crash the stream
    }
    dispatch(eventType, payload);
  }
  return buffer;
}

async function runStream() {
  const token = getToken();
  if (!token) return;

  // Captured locally (not just read off the module-level `abortController`
  // later) so a stale/superseded attempt can tell it's been superseded —
  // see the reconnect check at the bottom of this function.
  const myController = new AbortController();
  abortController = myController;
  try {
    const res = await fetch(`${API_URL}/notifications/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: myController.signal,
    });
    if (!res.ok || !res.body) throw new Error(`SSE connect failed (${res.status})`);

    reconnectDelayMs = 1000; // connected successfully — reset backoff
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Loop reads chunks until the server closes the stream or we abort
    // it ourselves (disconnect()/logout). Not wrapped in its own
    // try/catch — the outer one below handles both a network drop mid-
    // stream and a clean server-side close the same way: reconnect
    // unless this was a deliberate disconnect.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = consumeFrames(buffer);
    }
  } catch (err) {
    if (manuallyDisconnected) return; // expected — connect() aborted this on purpose
    // Any other failure (network drop, server restart, token expiry
    // mid-stream) falls through to the reconnect-with-backoff below.
  }

  // Only reconnect if this attempt is still the active one. If
  // disconnectSSE() then connectSSE() ran again while this fetch was
  // still in flight, `abortController` now points at a NEWER
  // controller than `myController` — this stale attempt must not also
  // schedule a reconnect on top of that newer one.
  if (manuallyDisconnected || abortController !== myController) return;
  reconnectTimer = setTimeout(() => {
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    runStream();
  }, reconnectDelayMs);
}

/** Opens the shared SSE connection. Safe to call again while already connected — it's a no-op in that case (connect() is called from AuthContext whenever `user` becomes non-null, which can re-fire on unrelated re-renders). */
export function connectSSE() {
  if (abortController) return; // already connecting/connected
  manuallyDisconnected = false;
  runStream();
}

/** Closes the shared SSE connection and cancels any pending reconnect — call on logout so a stale connection doesn't keep receiving another user's push events after a different account logs in on the same tab. */
export function disconnectSSE() {
  manuallyDisconnected = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

/** Subscribes to one SSE event type ('notification' | 'audit'). Returns an unsubscribe function — call it from a useEffect cleanup. */
export function subscribeSSE(eventType, handler) {
  if (!subscribers.has(eventType)) subscribers.set(eventType, new Set());
  subscribers.get(eventType).add(handler);
  return () => {
    const handlers = subscribers.get(eventType);
    if (handlers) handlers.delete(handler);
  };
}
