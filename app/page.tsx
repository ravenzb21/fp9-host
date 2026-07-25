'use client';
import { useState, useEffect } from 'react';
import { AppProvider } from '@/lib/context';
import Navbar from '@/components/Navbar';
import Landing from '@/components/LandingPage';
import Dashboard from '@/components/Dashboard';
import Footer from '@/components/Footer';
import { Bot } from '@/lib/data';
import { fetchBots, connectWS } from '@/lib/api';

function Content() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);

  useEffect(() => {
    if (localStorage.getItem('fp9-logged-in') === 'true' && localStorage.getItem('fp9-user')) setLoggedIn(true);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    connectWS();
    fetchBots().then(setBots).catch(() => setBots([]));
  }, [loggedIn]);

  const doLogin = () => {
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=1530409781045493882&redirect_uri=${encodeURIComponent('https://fp9.netlify.app/callback')}&response_type=code&scope=identify%20email`;
  };

  const doLogout = () => {
    setLoggedIn(false); setBots([]);
    ['fp9-logged-in', 'fp9-discord-token', 'fp9-user'].forEach(k => localStorage.removeItem(k));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar loggedIn={loggedIn} onLogout={doLogout} />
      <main className="flex-1">
        {loggedIn ? <Dashboard bots={bots} setBots={setBots} /> : <Landing onLogin={doLogin} />}
      </main>
      <Footer />
    </div>
  );
}

export default function Home() {
  return <AppProvider><Content /></AppProvider>;
}
