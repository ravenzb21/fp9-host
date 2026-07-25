const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const WS = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

let ws: WebSocket | null = null;
const listeners = new Map<string, Set<(d: any) => void>>();
let wsAttempts = 0;

export function connectWS() {
  if (ws?.readyState === WebSocket.OPEN) return;
  try { ws = new WebSocket(WS); } catch { return; }
  ws.onopen = () => { wsAttempts = 0; };
  ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      const key = m.botId ? `bot:${m.botId}` : m.type;
      listeners.get(key)?.forEach(f => f(m));
      listeners.get('*')?.forEach(f => f(m));
    } catch {}
  };
  ws.onclose = () => {
    if (wsAttempts < 10) setTimeout(connectWS, Math.min(1000 * Math.pow(2, wsAttempts++), 15000));
  };
  ws.onerror = () => ws?.close();
}

export function onMsg(botId: string | null, cb: (d: any) => void) {
  const key = botId ? `bot:${botId}` : '*';
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  if (ws?.readyState === WebSocket.OPEN && botId) ws.send(JSON.stringify({ type: 'sub', botId }));
  return () => { const s = listeners.get(key); if (s) s.delete(cb); };
}

export function sendCmd(botId: string, text: string) {
  ws?.send(JSON.stringify({ type: 'cmd', botId, text }));
}

async function req(path: string, opts?: RequestInit, retries = 2): Promise<any> {
  let last: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const o: RequestInit = {};
      if (opts?.method) o.method = opts.method;
      if (opts?.body) o.body = opts.body;
      if (opts?.headers) o.headers = opts.headers;
      const r = await fetch(`${API}${path}`, o);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        let msg: string;
        try { const j = JSON.parse(body); msg = j.error || j.message || body; } catch { msg = body || `Error ${r.status}`; }
        throw new Error(msg);
      }
      return r.json();
    } catch (e: any) {
      last = e;
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last || new Error('Request failed');
}

export const uploadBot = (file: File, name: string) => {
  const fd = new FormData();
  fd.append('file', file); fd.append('name', name);
  return req('/api/upload', { method: 'POST', body: fd }, 1);
};

export const fetchBots = () => req('/api/bots');
export const fetchBot = (id: string) => req(`/api/bots/${id}`);
export const startBot = (id: string) => req(`/api/bots/${id}/start`, { method: 'POST' });
export const stopBot = (id: string) => req(`/api/bots/${id}/stop`, { method: 'POST' });
export const restartBot = (id: string) => req(`/api/bots/${id}/restart`, { method: 'POST' });
export const saveFile = (botId: string, filePath: string, content: string) =>
  req(`/api/bots/${botId}/files`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath, content }) });
export const deleteBot = (id: string) => req(`/api/bots/${id}`, { method: 'DELETE' });
