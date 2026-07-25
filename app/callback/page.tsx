'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function CallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(params.get('error_description') || 'Login was denied');
      return;
    }

    if (!code) {
      setError('No authorization code received');
      return;
    }

    const exchangeCode = async () => {
      try {
        const redirectUri = `${window.location.origin}/callback`;

        const res = await fetch(`${API_URL}/api/auth/discord`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri }),
        });

        const data = await res.json();

        if (data.error) {
          setError(data.error);
          return;
        }

        localStorage.setItem('fp9-logged-in', 'true');
        localStorage.setItem('fp9-discord-token', data.access_token);
        localStorage.setItem('fp9-user', JSON.stringify(data.user));

        window.location.href = '/';
      } catch (err) {
        setError('Failed to authenticate. Please try again.');
      }
    };

    exchangeCode();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        {error ? (
          <div className="card max-w-md">
            <div className="text-discord-red text-4xl mb-4">❌</div>
            <h2 className="text-xl font-bold mb-2">Authentication Error</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
            <a href="/" className="btn-primary inline-flex">
              Back to Home
            </a>
          </div>
        ) : (
          <div className="card max-w-md">
            <div className="animate-spin w-12 h-12 border-4 border-discord-blurple border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Authenticating...</h2>
            <p className="text-gray-500 dark:text-gray-400">Please wait while we log you in.</p>
          </div>
        )}
      </div>
    </div>
  );
}
