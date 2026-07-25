const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

let ws: WebSocket | null = null;
let wsListeners: Map<string, Set<(data: any) => void>> = new Map();
let wsReconnectTimer: any = null;
let wsReconnectAttempts = 0;

export function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;
  try {
    ws = new WebSocket(WS_URL);
  } catch { return null; }
  ws.onopen = () => { wsReconnectAttempts = 0; };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type && wsListeners.has(msg.type)) {
        wsListeners.get(msg.type)!.forEach(fn => fn(msg));
      }
      if (msg.botId && wsListeners.has(`bot:${msg.botId}`)) {
        wsListeners.get(`bot:${msg.botId}`)!.forEach(fn => fn(msg));
      }
    } catch {}
  };
  ws.onclose = () => {
    const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 30000);
    wsReconnectAttempts++;
    wsReconnectTimer = setTimeout(connectWebSocket, delay);
  };
  ws.onerror = () => { ws?.close(); };
  return ws;
}

export function subscribeBot(botId: string, callback: (data: any) => void) {
  if (!wsListeners.has(`bot:${botId}`)) wsListeners.set(`bot:${botId}`, new Set());
  wsListeners.get(`bot:${botId}`)!.add(callback);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', botId }));
  }
  return () => {
    wsListeners.get(`bot:${botId}`)?.delete(callback);
  };
}

export function sendConsoleInput(botId: string, text: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', botId, text }));
  }
}

async function apiFetch(path: string, options?: RequestInit, retries = 2): Promise<any> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const opts: RequestInit = { method: 'GET' };
      if (options) {
        if (options.method) opts.method = options.method;
        if (options.body) opts.body = options.body;
        if (options.headers) {
          opts.headers = {};
          const h = options.headers as Record<string, string>;
          Object.keys(h).forEach(k => { (opts.headers as Record<string, string>)[k] = h[k]; });
        }
      }
      const res = await fetch(`${API_URL}${path}`, opts);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg: string;
        try { const j = JSON.parse(body); msg = j.error || j.message || body; } catch { msg = body || `HTTP ${res.status}`; }
        throw new Error(msg);
      }
      return res.json();
    } catch (err: any) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr || new Error('Request failed');
}

export async function uploadBot(file: File, name: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  return apiFetch('/api/upload', { method: 'POST', body: formData }, 1);
}

export async function fetchBots() {
  return apiFetch('/api/bots');
}

export async function fetchBot(id: string) {
  return apiFetch(`/api/bots/${id}`);
}

export async function startBot(id: string) {
  return apiFetch(`/api/bots/${id}/start`, { method: 'POST' });
}

export async function stopBot(id: string) {
  return apiFetch(`/api/bots/${id}/stop`, { method: 'POST' });
}

export async function restartBot(id: string) {
  return apiFetch(`/api/bots/${id}/restart`, { method: 'POST' });
}

export async function saveFile(botId: string, filePath: string, content: string) {
  return apiFetch(`/api/bots/${botId}/files`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  });
}

export async function deleteBot(id: string) {
  return apiFetch(`/api/bots/${id}`, { method: 'DELETE' });
}
