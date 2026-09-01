'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/hooks/useTheme';

type Field = 'username' | 'create' | 'join';

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<Field | null>(null);
  const { theme, toggleTheme } = useTheme();

  const busy = creating || joining;

  const fail = (field: Field, message: string) => {
    setError(message);
    setErrorField(field);
  };

  const clearError = () => {
    if (error) {
      setError('');
      setErrorField(null);
    }
  };

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;

    if (!username.trim()) return fail('username', 'Enter your name first.');
    if (!roomName.trim()) return fail('create', 'Give your board a name.');

    clearError();
    setCreating(true);

    try {
      const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName.trim(), createdBy: username.trim() }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const room = await res.json();
      router.push(`/room/${room.accessCode}?username=${encodeURIComponent(username.trim())}`);
    } catch (err) {
      console.error('Failed to create room:', err);
      setCreating(false);
      fail('create', "Couldn't create the room. Check that the server is running.");
    }
  };

  const handleJoin = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;

    if (!username.trim()) return fail('username', 'Enter your name first.');
    if (joinCode.trim().length < 8) return fail('join', 'Room codes are 8 characters long.');

    clearError();
    setJoining(true);

    window.setTimeout(() => {
      router.push(`/room/${joinCode.trim().toLowerCase()}?username=${encodeURIComponent(username.trim())}`);
    }, 250);
  };

  const sanitizeJoinCode = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  return (
    <div className="relative min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,rgba(235,174,62,0.07),transparent_42%)]"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 21l3.5-1.5L18.5 7.5a2.5 2.5 0 0 0-3.5-3.5L3 15.5V21z"
                stroke="var(--accent)"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M15 5l3 3" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-display text-lg tracking-tight">CollabBoard</span>
        </div>

        <button
          onClick={toggleTheme}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? 'Light' : 'Dark'} mode
        </button>
      </header>

      <main className="relative z-10 flex-1 grid items-center md:grid-cols-2">
        <section className="flex flex-col items-center px-6 text-center md:items-start md:px-16 md:text-left lg:px-24">
          <h1 className="font-display text-5xl leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
            Draw together,
            <br />
            <span className="text-[var(--text-muted)]">in real time.</span>
          </h1>

          <p className="mt-6 max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
            CollabBoard is a shared whiteboard for teams. Sketch, plan, and think
            out loud together — live, with no setup.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-8 text-center md:text-left">
            {[
              ['Realtime', 'Synced across every cursor'],
              ['Private', 'Rooms are invite-only'],
              ['Zero setup', 'Share one link to start'],
            ].map(([term, desc]) => (
              <div key={term}>
                <dt className="text-xs font-medium">{term}</dt>
                <dd className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">{desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="px-6 py-14 md:px-12 md:py-16 lg:px-24">
          <div className="mx-auto w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_12px_40px_-18px_rgba(0,0,0,0.6)] sm:p-8">
            <form
              className="space-y-6"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="space-y-2">
                <label htmlFor="username" className="block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Your name
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    clearError();
                  }}
                  autoFocus
                  autoComplete="name"
                  placeholder="e.g., Tushar"
                  aria-invalid={errorField === 'username'}
                  aria-describedby={errorField === 'username' ? 'form-error' : undefined}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm transition-colors placeholder:text-[var(--text-muted)]/60 focus:border-[var(--accent)] focus:outline-none"
                />
                <p className="text-[11px] text-[var(--text-muted)]">Shown to people in the board.</p>
              </div>

              <div className="space-y-3 border-t border-[var(--border)] pt-6">
                <label htmlFor="room-name" className="block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Create a new room
                </label>
                <div className="flex gap-2">
                  <input
                    id="room-name"
                    type="text"
                    value={roomName}
                    onChange={(e) => {
                      setRoomName(e.target.value);
                      clearError();
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate(e)}
                    placeholder="e.g., Sprint planning"
                    aria-invalid={errorField === 'create'}
                    aria-describedby={errorField === 'create' ? 'form-error' : undefined}
                    className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm transition-colors placeholder:text-[var(--text-muted)]/60 focus:border-[var(--accent)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    onClick={(e) => handleCreate(e)}
                    disabled={busy}
                    className="group inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--text)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--bg)]/30 border-t-[var(--bg)]" />
                        Creating
                      </>
                    ) : (
                      <>
                        Create
                        <svg
                          className="transition-transform group-hover:translate-x-0.5"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden
                        >
                          <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            <div className="my-6 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
              <div className="h-px flex-1 bg-[var(--border)]" />
              or
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <form className="space-y-3" onSubmit={(e) => handleJoin(e)}>
              <label htmlFor="join-code" className="block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Join with a code
              </label>
              <input
                id="join-code"
                type="text"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(sanitizeJoinCode(e.target.value));
                  clearError();
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin(e)}
                placeholder="A1B2C3D4"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
                aria-invalid={errorField === 'join'}
                aria-describedby={errorField === 'join' ? 'form-error' : undefined}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 font-mono text-sm tracking-[0.3em] transition-colors placeholder:text-[var(--text-muted)]/40 focus:border-[var(--accent)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {joining ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--text)]" />
                    Joining
                  </>
                ) : (
                  'Join room'
                )}
              </button>
            </form>

            {error && (
              <p
                id="form-error"
                role="alert"
                className="mt-5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3.5 py-2.5 text-xs text-[var(--accent)]"
              >
                {error}
              </p>
            )}
          </div>

          <p className="mx-auto mt-5 w-full max-w-sm text-center text-[11px] text-[var(--text-muted)]">
            Press <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> to submit. No account needed.
          </p>
        </section>
      </main>
    </div>
  );
}