'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/hooks/useTheme';


export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const { theme, toggleTheme } = useTheme();

  const handleCreateRoom = async () => {
    if (!name.trim()) {
      setError('Please enter a room name.');
      return;
    }
    if (!username.trim()) {
      setError('Please enter your name.');
      return;
    }
    
    setIsCreating(true);
    setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, createdBy: username }),
      });
      if (!res.ok) throw new Error('Failed to create room');
      const room = await res.json();
      router.push(`/room/${room.accessCode}?username=${encodeURIComponent(username)}`);
    } catch {
      setError("Couldn't create the room. Please try again.");
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (!joinCode.trim()) {
      setError('Please enter a room code.');
      return;
    }
    if (!username.trim()) {
      setError('Please enter your name.');
      return;
    }
    setIsJoining(true);
    setError('');
    // Simulate brief delay to show the button is responsive
    setTimeout(() => {
      router.push(`/room/${joinCode}?username=${encodeURIComponent(username)}`);
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent, callback: () => void) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      callback();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <div className="flex justify-end px-6 py-4 md:px-8 border-b border-[var(--border)]">
        <button
          onClick={toggleTheme}
          className="text-xs px-2 py-1 rounded-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>

      <div className="flex-1 grid md:grid-cols-2">
        <div className="flex flex-col items-center text-center md:items-start md:text-left justify-center px-6 md:px-16 py-12 md:py-16 border-b md:border-b-0 md:border-r border-[var(--border)]">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.05] mb-6">
            Draw together,
            <br />
            in real time.
          </h1>
          <p className="text-[var(--text-muted)] text-sm leading-relaxed max-w-sm">
            CollabBoard is a shared whiteboard for teams. Sketch, plan, and think
            out loud together — live, with no setup.
          </p>
        </div>

        <div className="flex flex-col justify-center px-6 md:px-16 py-12 md:py-16">
          <div className="w-full max-w-sm mx-auto space-y-8">
            {/* Your Name Section */}
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-muted)] font-medium">Your name</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleCreateRoom)}
                className="w-full px-3 py-2 rounded-sm text-sm border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="e.g., Tushar"
                autoFocus
              />
            </div>

            {/* Create Room Section */}
            <div className="space-y-3 pt-6 border-t border-[var(--border)]">
              <label className="text-xs text-[var(--text-muted)] font-medium">Create new room</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleCreateRoom)}
                className="w-full px-3 py-2 rounded-sm text-sm border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="e.g., Sprint planning"
              />
              <button
                onClick={handleCreateRoom}
                disabled={isCreating || !username.trim()}
                className="w-full py-2 rounded-sm text-sm font-medium bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating…' : 'Create room'}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
              <div className="flex-1 border-t border-[var(--border)]" />
              or
              <div className="flex-1 border-t border-[var(--border)]" />
            </div>

            {/* Join Room Section */}
            <div className="space-y-3">
              <label className="text-xs text-[var(--text-muted)] font-medium">Join room with code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => handleKeyDown(e, handleJoinRoom)}
                className="w-full px-3 py-2 rounded-sm text-sm border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:border-[var(--accent)] transition-colors uppercase tracking-wider"
                placeholder="e.g., A1B2C3D4"
                maxLength={8}
              />
              <button
                onClick={handleJoinRoom}
                disabled={isJoining || !username.trim() || !joinCode.trim()}
                className="w-full py-2 rounded-sm text-sm font-medium border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isJoining ? 'Joining…' : 'Join room'}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-sm bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}