// Live-update hub (Server-Sent Events).
//
// Replaces the old "no websocket/SSE infra in this project" tradeoff
// (see the comment that used to sit on client/src/components/
// NotificationBell.jsx's 30s poll) now that the spec asks for updates —
// new notifications, new audit-trail activity — to reach every logged-in
// client immediately, without a page refresh and without wiping out
// whatever the user is in the middle of doing.
//
// Design, and why it's this shape:
//  - In-memory registry of open HTTP responses, keyed by userId (a Set,
//    since the same user may have several tabs/devices open) AND
//    indexed by role (for role-wide broadcasts like the Super Admin
//    audit feed, where the *specific* recipient isn't known up front —
//    "whoever is currently a super_admin"). Both are just views over the
//    same underlying connection records, not duplicated state.
//  - Deliberately NOT backed by Redis/pub-sub. This assumes a single
//    Node process (matches how this app is actually run — see
//    server.js: one `app.listen`, no cluster module, deployed as one
//    Render web service per the project's existing setup). If this ever
//    moves to multiple horizontally-scaled instances behind a load
//    balancer, a client connected to instance A would never see a push
//    triggered by an action that landed on instance B — at that point
//    this module's `broadcastToRole`/`sendToUser` calls would need to
//    publish through a shared channel (Redis pub/sub is the standard
//    fix) instead of writing to local `res` objects directly. Flagging
//    this now rather than silently baking in a single-instance
//    assumption nobody wrote down.
//  - Callers never touch `res` directly — they call sendToUser/
//    broadcastToRole with a plain event object and this module handles
//    SSE framing, connection bookkeeping, and dead-connection cleanup.

const CLIENT_TIMEOUT_MS = 25000; // heartbeat interval — see addClient() below

// userId (string) -> Set<connection>
const byUser = new Map();
// role (string) -> Set<connection>
const byRole = new Map();

function addToIndex(index, key, conn) {
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(conn);
}

function removeFromIndex(index, key, conn) {
  const set = index.get(key);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) index.delete(key);
}

function writeEvent(res, event, payload) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    // Dead socket — the periodic heartbeat below will find and evict it
    // on its next pass via the same catch path.
    return false;
  }
}

/**
 * Registers `res` as an open SSE connection for this user/role. Sends
 * the SSE headers and an initial `connected` event immediately. Returns
 * a `close()` function the route handler MUST call when the connection
 * ends (on the request's 'close' event) to avoid leaking dead
 * connections in the registry forever.
 */
function addClient({ userId, role }, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disables response buffering on nginx-fronted deployments — without
    // this an SSE stream can sit fully buffered and never actually reach
    // the client until the buffer fills or the connection closes.
    'X-Accel-Buffering': 'no',
  });
  // flushHeaders isn't in the Node http.ServerResponse type in every
  // version, but is present on Express's res (extends OutgoingMessage) —
  // guarded anyway since a missing flush just delays the first byte
  // slightly rather than breaking anything.
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const conn = { res, userId, role };
  addToIndex(byUser, userId, conn);
  if (role) addToIndex(byRole, role, conn);

  writeEvent(res, 'connected', { ok: true });

  const heartbeat = setInterval(() => {
    // A raw comment line (no `event:`/`data:`) — valid SSE, invisible to
    // consumers' onmessage/addEventListener handlers, just keeps
    // intermediary proxies/load balancers from timing the connection out
    // during quiet periods, and surfaces a dead socket quickly via the
    // write() failure path above instead of waiting on a stalled TCP
    // connection.
    try {
      res.write(': heartbeat\n\n');
    } catch {
      close();
    }
  }, CLIENT_TIMEOUT_MS);

  function close() {
    clearInterval(heartbeat);
    removeFromIndex(byUser, userId, conn);
    if (role) removeFromIndex(byRole, role, conn);
    try {
      res.end();
    } catch {
      // already closed
    }
  }

  return close;
}

/** Pushes `payload` under SSE event name `event` to every open connection for this user (all their tabs/devices). No-op if they have none open — the notification itself is still persisted to the DB by the caller beforehand, so nothing is lost, it just won't show up live. */
function sendToUser(userId, event, payload) {
  const conns = byUser.get(String(userId));
  if (!conns) return;
  for (const conn of conns) writeEvent(conn.res, event, payload);
}

/** Pushes `payload` to every currently-connected user holding `role` (e.g. every logged-in super_admin, for the live audit feed). */
function broadcastToRole(role, event, payload) {
  const conns = byRole.get(role);
  if (!conns) return;
  for (const conn of conns) writeEvent(conn.res, event, payload);
}

module.exports = { addClient, sendToUser, broadcastToRole };
