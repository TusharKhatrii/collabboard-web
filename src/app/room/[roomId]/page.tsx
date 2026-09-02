'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSocket } from '@/hooks/useSocket';
import '@excalidraw/excalidraw/index.css';
import type { Collaborator, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types';
import { useTheme } from '@/hooks/useTheme';


const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

interface Participant {
  socketId: string;
  username: string;
}

type SceneElement = ExcalidrawImperativeAPI['getSceneElementsIncludingDeleted'] extends () => infer R
  ? R extends readonly (infer E)[]
    ? E
    : never
  : never;

const CURSOR_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
function colorForSocket(socketId: string): { background: string; stroke: string } {
  let hash = 0;
  for (let i = 0; i < socketId.length; i++) hash = socketId.charCodeAt(i) + ((hash << 5) - hash);
  const color = CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
  return { background: color, stroke: color };
}

const apiBase = () => (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { socket, isConnected } = useSocket();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [username, setUsername] = useState(() => searchParams.get('username') ?? '');
  const [showNamePrompt, setShowNamePrompt] = useState(() => !searchParams.get('username'));
  const [mounted, setMounted] = useState(false);
  const [promptName, setPromptName] = useState('');
  const [joiningError, setJoiningError] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomLoading, setRoomLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteRef = useRef<HTMLDivElement | null>(null);
  // scene persistence state
  const [savedScene, setSavedScene] = useState<readonly SceneElement[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const [excalidrawReady, setExcalidrawReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  // keep the scene frozen until the initial DB scene has been applied so the
  // browser's localStorage autosave can't leak stale state into the room
  const isApplyingRemoteUpdate = useRef(true);
  const restoreStartedRef = useRef(false);
  const lastRemoteTimestampRef = useRef<number>(0);

  // throttle state: always holds the LATEST pending payload, not a stale one
  const pendingElementsRef = useRef<readonly SceneElement[]>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Fetch room details + saved scene from backend (MongoDB)
  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const normalizedRoomId = roomId.toLowerCase();
        const res = await fetch(`${apiBase()}/api/rooms/${normalizedRoomId}`);

        if (res.ok) {
          const room = await res.json();
          setRoomName(room.name || normalizedRoomId);
          if (Array.isArray(room.elements)) {
            setSavedScene(room.elements);
          }
        } else {
          setRoomName(roomId);
        }
      } catch {
        setRoomName(roomId);
      } finally {
        setRoomLoading(false);
        setSceneReady(true);
      }
    };

    if (roomId) {
      fetchRoom();
    }
  }, [roomId]);

  // Set the document title from the join params
  useEffect(() => {
    const urlUsername = searchParams.get('username') ?? '';
    document.title = urlUsername ? `${urlUsername} · ${roomName || roomId}` : 'CollabBoard';
  }, [searchParams, roomName, roomId]);

  // Hydrate a previously stored name (if no URL param) without breaking SSR hydration.
  // Flips `mounted` so we never show the prompt before the client knows who this is.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchParams.get('username')) {
        setMounted(true);
        return;
      }
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(`cb-room:${roomId}:name`);
      } catch {
        stored = null;
      }
      if (stored) {
        setUsername(stored);
        setShowNamePrompt(false);
      }
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [roomId, searchParams]);

  // Auto-join when socket is ready and username is available
  useEffect(() => {
    if (!socket || !username) return;

    socket.emit('join-room', { roomId: roomId.toLowerCase(), username });
  }, [socket, username, roomId]);

  useEffect(() => {
    if (!socket) return;

    socket.on('presence-update', (updatedParticipants: Participant[]) => {
      setParticipants(updatedParticipants);
    });

    // When someone leaves/disconnects, remove their cursor marker immediately.
    socket.on('participant-left', ({ socketId }: { socketId: string }) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const current = api.getAppState().collaborators ?? new Map<SocketId, Collaborator>();
      if (!current.has(socketId as SocketId)) return;
      const updated = new Map<SocketId, Collaborator>(current);
      updated.delete(socketId as SocketId);
      api.updateScene({ collaborators: updated });
    });

    socket.on('draw-update', async (payload: { roomId: string; elements: readonly SceneElement[]; timestamp?: number }) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      // Prevent applying our own updates
      if (isApplyingRemoteUpdate.current) return;

      // Only apply if this is a newer update
      if (payload.timestamp && payload.timestamp <= lastRemoteTimestampRef.current) return;
      if (payload.timestamp) lastRemoteTimestampRef.current = payload.timestamp;

      try {
        isApplyingRemoteUpdate.current = true;

        // Get current state
        const localElements = api.getSceneElementsIncludingDeleted();
        const appState = api.getAppState();

        // Use reconcileElements to merge changes
        const { reconcileElements } = await import('@excalidraw/excalidraw');
        // The remote payload elements carry the same shape as local ones; bridge
        // them into the RemoteExcalidrawElement[] contract the reconciler wants.
        const remoteElements = payload.elements as Parameters<typeof reconcileElements>[1];
        const reconciled = reconcileElements(localElements, remoteElements, appState);

        // Update the scene with reconciled elements
        api.updateScene({
          elements: reconciled,
          captureUpdate: 'NEVER',
        });
      } finally {
        isApplyingRemoteUpdate.current = false;
      }
    });

    socket.on('cursor-move', (payload: { socketId: string; username: string; x: number; y: number }) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      const current = api.getAppState().collaborators ?? new Map<SocketId, Collaborator>();
      const updated = new Map<SocketId, Collaborator>(current);
      updated.set(payload.socketId as SocketId, {
        username: payload.username,
        pointer: { x: payload.x, y: payload.y, tool: 'pointer' },
        color: colorForSocket(payload.socketId),
      });

      api.updateScene({ collaborators: updated });
    });

    return () => {
      socket.off('presence-update');
      socket.off('participant-left');
      socket.off('draw-update');
      socket.off('cursor-move');
    };
  }, [socket]);

  // Excalidraw mounts seeded with the DB scene via `initialData`. Hold the
  // change guard for a short window after mount so the initial render (which
  // emits the seeded scene) isn't echoed into the room or treated as a user edit.
  useEffect(() => {
    if (!excalidrawReady || !sceneReady || restoreStartedRef.current) return;

    restoreStartedRef.current = true;

    // release the freeze once any change notifications from the seeded mount flush
    window.setTimeout(() => {
      isApplyingRemoteUpdate.current = false;
    }, 100);
  }, [excalidrawReady, sceneReady]);

  const handleExcalidrawChange = (elements: readonly SceneElement[]) => {
    if (isApplyingRemoteUpdate.current) return;
    if (!restoreStartedRef.current) return;
    if (!socket) return;

    setDirty(true);

    pendingElementsRef.current = elements;

    if (throttleTimerRef.current) return;

    throttleTimerRef.current = setTimeout(() => {
      socket.emit('draw-update', { roomId: roomId.toLowerCase(), elements: pendingElementsRef.current });
      throttleTimerRef.current = null;
    }, 80);
  };

  const handlePointerUpdate = (payload: { pointer: { x: number; y: number } }) => {
    if (!socket) return;
    if (cursorThrottleRef.current) return;

    cursorThrottleRef.current = setTimeout(() => {
      socket.emit('cursor-move', {
        roomId: roomId.toLowerCase(),
        socketId: socket.id,
        username,
        x: payload.pointer.x,
        y: payload.pointer.y,
      });
      cursorThrottleRef.current = null;
    }, 50);
  };

  const handleSave = async () => {
    const api = excalidrawAPIRef.current;
    if (!api || saving) return;

    const elements = api.getSceneElementsIncludingDeleted();
    setSaving(true);
    setSaveFailed(false);

    try {
      const res = await fetch(`${apiBase()}/api/rooms/${roomId.toLowerCase()}/scene`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements }),
      });

      if (!res.ok) throw new Error(`Save failed (${res.status})`);

      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      console.error('Failed to save scene:', err);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      const url = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
        setInviteOpen(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  const openInvite = () => {
    setCopied(false);
    setInviteOpen((o) => !o);
  };

  // Close the invite popover on outside click / Escape
  useEffect(() => {
    if (!inviteOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (inviteRef.current && !inviteRef.current.contains(e.target as Node)) {
        setInviteOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInviteOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [inviteOpen]);

  // Wait until the client has checked localStorage so the name prompt never
  // flashes before the stored identity is hydrated (keeps SSR deterministic too)
  if (!mounted) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="h-12 w-12 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin" />
      </div>
    );
  }

  // Prompt for a name before letting anyone into the room
  if (showNamePrompt) {
    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      const name = promptName.trim();
      if (!name) {
        setJoiningError('Please enter your name.');
        return;
      }
      setUsername(name);
      try {
        localStorage.setItem(`cb-room:${roomId}:name`, name);
      } catch {
        /* ignore storage failures */
      }
      setShowNamePrompt(false);
      setJoiningError('');
    };

    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg)] px-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-xl"
        >
          <h1 className="font-display text-2xl mb-1">{roomName || roomId}</h1>
          <p className="mb-5 text-sm text-[var(--text-muted)]">
            You&apos;re about to join this board. Pick a name to show while you&apos;re here.
          </p>
          <label htmlFor="prompt-name" className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Your name
          </label>
          <input
            id="prompt-name"
            type="text"
            value={promptName}
            onChange={(e) => setPromptName(e.target.value)}
            autoFocus
            autoComplete="name"
            placeholder="e.g., Tushar"
            aria-invalid={!!joiningError}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm placeholder:text-[var(--text-muted)]/60 focus:border-[var(--accent)] focus:outline-none"
          />
          {joiningError && (
            <p className="mt-2 text-xs text-[var(--accent)]" role="alert">
              {joiningError}
            </p>
          )}
          <button
            type="submit"
            disabled={!promptName.trim()}
            className="mt-4 w-full rounded-md bg-[var(--text)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Join board
          </button>
        </form>
      </div>
    );
  }

  // Show loading screen while waiting for socket connection
  if (!isConnected) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <div className="h-12 w-12 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin mx-auto" />
            <p className="text-sm text-[var(--text-muted)]">Connecting to room...</p>
            {roomName && !roomLoading && (
              <p className="text-xs text-[var(--text)]">{roomName}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const others = participants.filter((p) => p.socketId !== socket?.id);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <div className="h-14 flex items-center justify-between gap-4 px-4 md:px-6 border-b border-[var(--border)] bg-[var(--surface)] text-sm shrink-0">
        <span className="font-display text-lg truncate">{roomName || roomId}</span>

        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="flex items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg)]">
            {others.length === 0 ? (
              <span className="px-3 py-1 text-[11px] text-[var(--text-muted)]">Only you</span>
            ) : (
              others.map((p) => (
                <span
                  key={p.socketId}
                  className="flex h-7 w-7 items-center justify-center text-[11px] font-medium"
                  style={{ backgroundColor: colorForSocket(p.socketId).background, color: '#fff' }}
                  title={p.username}
                >
                  {p.username.slice(0, 2).toUpperCase()}
                </span>
              ))
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            title={
              saving
                ? 'Saving…'
                : saveFailed
                  ? 'Last save failed'
                  : savedAt
                    ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Persist this board to the server'
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              saveFailed
                ? 'border-red-500/50 text-red-400'
                : 'border-[var(--border)] hover:border-[var(--accent)]'
            }`}
          >
            {saving
              ? 'Saving…'
              : saveFailed
                ? 'Retry save'
                : dirty
                  ? 'Save'
                  : savedAt
                    ? 'Saved'
                    : 'Save'}
          </button>

          <div ref={inviteRef} className="relative">
            <button
              onClick={openInvite}
              aria-haspopup="dialog"
              aria-expanded={inviteOpen}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--accent)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Invite
            </button>

            {inviteOpen && (
              <div
                role="dialog"
                aria-label="Invite to room"
                className="absolute right-0 top-9 z-30 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl"
              >
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Invite someone
                </p>
                {copied ? (
                  <p className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2.5 text-center text-xs text-[var(--accent)]">
                    Link copied!
                  </p>
                ) : (
                  <button
                    onClick={copyInviteLink}
                    autoFocus
                    className="inline-flex w-full items-center justify-center rounded-md bg-[var(--text)] px-3 py-2 text-xs font-medium text-[var(--bg)] transition-colors hover:bg-[var(--accent)]"
                  >
                    Copy room link
                  </button>
                )}
                <p className="mt-2 text-[10px] leading-snug text-[var(--text-muted)]">
                  Anyone with the link joins the board.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={toggleTheme}
            className="hidden rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--accent)] sm:inline-flex"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>

          <button
            onClick={() => router.push('/')}
            className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-red-500/50 hover:text-red-400"
          >
            Leave
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {roomLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
            Loading board…
          </div>
        ) : (
          <Excalidraw
            initialData={{ elements: savedScene }}
            excalidrawAPI={(api) => {
              excalidrawAPIRef.current = api;
              setExcalidrawReady(true);
            }}
            onChange={handleExcalidrawChange}
            onPointerUpdate={handlePointerUpdate}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
}