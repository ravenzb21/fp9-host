'use client';

import { useState, useEffect } from 'react';
import { AppProvider } from '@/lib/context';
import Navbar from '@/components/Navbar';
import LandingPage from '@/components/LandingPage';
import Dashboard from '@/components/Dashboard';
import Footer from '@/components/Footer';
import { Bot } from '@/lib/data';
import { fetchBots, connectWebSocket } from '@/lib/api';

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);

  useEffect(() => {
    const savedLogin = localStorage.getItem('fp9-logged-in');
    const savedUser = localStorage.getItem('fp9-user');
    if (savedLogin === 'true' && savedUser) {
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      connectWebSocket();
      fetchBots()
        .then(data => setBots(data))
        .catch(() => setBots([]));
    }
  }, [isLoggedIn]);

  const handleLogin = () => {
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=1530409781045493882&redirect_uri=${encodeURIComponent('https://fp9.netlify.app/callback')}&response_type=code&scope=identify%20email`;
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setBots([]);
    localStorage.removeItem('fp9-logged-in');
    localStorage.removeItem('fp9-discord-token');
    localStorage.removeItem('fp9-user');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} />
      <main className="flex-1">
        {isLoggedIn ? (
          <Dashboard bots={bots} setBots={setBots} />
        ) : (
          <LandingPage onLogin={handleLogin} />
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
