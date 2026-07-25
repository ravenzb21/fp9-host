const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

let ws: WebSocket | null = null;
let wsListeners: Map<string, Set<(data: any) => void>> = new Map();

export function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;
  ws = new WebSocket(WS_URL);
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
    setTimeout(connectWebSocket, 3000);
  };
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

export async function uploadBot(file: File, name: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function fetchBots() {
  const res = await fetch(`${API_URL}/api/bots`);
  if (!res.ok) throw new Error('Failed to fetch bots');
  return res.json();
}

export async function fetchBot(id: string) {
  const res = await fetch(`${API_URL}/api/bots/${id}`);
  if (!res.ok) throw new Error('Bot not found');
  return res.json();
}

export async function startBot(id: string) {
  const res = await fetch(`${API_URL}/api/bots/${id}/start`, { method: 'POST' });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to start'); }
  return res.json();
}

export async function stopBot(id: string) {
  const res = await fetch(`${API_URL}/api/bots/${id}/stop`, { method: 'POST' });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to stop'); }
  return res.json();
}

export async function restartBot(id: string) {
  const res = await fetch(`${API_URL}/api/bots/${id}/restart`, { method: 'POST' });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to restart'); }
  return res.json();
}

export async function saveFile(botId: string, filePath: string, content: string) {
  const res = await fetch(`${API_URL}/api/bots/${botId}/files`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  });
  if (!res.ok) throw new Error('Failed to save file');
  return res.json();
}

export async function deleteBot(id: string) {
  const res = await fetch(`${API_URL}/api/bots/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete bot');
  return res.json();
}
