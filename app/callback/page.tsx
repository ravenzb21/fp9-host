'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Callback() {
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (params.get('error')) { setError(params.get('error_description') || 'Login denied'); return; }
    if (!code) { setError('No code'); return; }
    (async () => {
      try {
        const r = await fetch(`${API}/api/auth/discord`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri: `${window.location.origin}/callback` }),
        });
        const d = await r.json();
        if (d.error) { setError(d.error); return; }
        localStorage.setItem('fp9-logged-in', 'true');
        localStorage.setItem('fp9-discord-token', d.access_token);
        localStorage.setItem('fp9-user', JSON.stringify(d.user));
        window.location.href = '/';
      } catch { setError('Authentication failed'); }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="card max-w-md text-center p-8">
        {error ? (
          <>
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-xl font-bold mb-2">Error</h2>
            <p className="text-gray-500 mb-4">{error}</p>
            <a href="/" className="btn-primary">Back</a>
          </>
        ) : (
          <>
            <div className="animate-spin w-10 h-10 border-4 border-discord-blurple border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-bold">Logging in...</h2>
          </>
        )}
      </div>
    </div>
  );
}
