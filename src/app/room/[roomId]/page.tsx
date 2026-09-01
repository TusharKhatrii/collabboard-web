'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSocket } from '@/hooks/useSocket';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { SocketId } from '@excalidraw/excalidraw/types';
import { useTheme } from '@/hooks/useTheme';


const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

interface Participant {
  socketId: string;
  username: string;
}

const CURSOR_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
function colorForSocket(socketId: string): { background: string; stroke: string } {
  let hash = 0;
  for (let i = 0; i < socketId.length; i++) hash = socketId.charCodeAt(i) + ((hash << 5) - hash);
  const color = CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
  return { background: color, stroke: color };
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const { socket, isConnected } = useSocket();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomLoading, setRoomLoading] = useState(true);
  

  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const isApplyingRemoteUpdate = useRef(false);
  const lastRemoteTimestampRef = useRef<number>(0);

  // throttle state: always holds the LATEST pending payload, not a stale one
  const pendingElementsRef = useRef<any>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Fetch room details from backend (MongoDB)
  useEffect(() => {
    const fetchRoomName = async () => {
      try {
        // Normalize roomId to lowercase for MongoDB query
        const normalizedRoomId = roomId.toLowerCase();
        const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/rooms/${normalizedRoomId}`;
        console.log('Fetching room from:', apiUrl);
        
        const res = await fetch(apiUrl);
        console.log('Response status:', res.status);
        
        if (res.ok) {
          const room = await res.json();
          console.log('Room data:', room);
          setRoomName(room.name || normalizedRoomId);
        } else {
          console.log('API returned non-ok status, using roomId');
          setRoomName(roomId);
        }
      } catch (error) {
        console.error('Failed to fetch room:', error);
        setRoomName(roomId);
      } finally {
        setRoomLoading(false);
      }
    };
    
    if (roomId) {
      fetchRoomName();
    }
  }, [roomId]);

  // Extract username from URL params
  useEffect(() => {
    const urlUsername = searchParams.get('username');
    if (urlUsername) {
      setUsername(urlUsername);
    }
  }, [searchParams]);  

  // Auto-join when socket is ready and username is available
  useEffect(() => {
    if (!socket || !username || hasJoined) return;
    
    setIsLoading(true);
    socket.emit('join-room', { roomId: roomId.toLowerCase(), username });
    setHasJoined(true);
    setIsLoading(false);
  }, [socket, username, hasJoined, roomId]);

  useEffect(() => {
    if (!socket) return;

    socket.on('presence-update', (updatedParticipants: Participant[]) => {
      setParticipants(updatedParticipants);
    });

    socket.on('draw-update', async (payload: { roomId: string; elements: any[]; timestamp?: number }) => {
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
        const reconciled = reconcileElements(localElements, payload.elements, appState);
        
        // Update the scene with reconciled elements
        api.updateScene({ 
          elements: reconciled,
          storeAction: 'capture',
        });
      } finally {
        isApplyingRemoteUpdate.current = false;
      }
    });

    socket.on('cursor-move', (payload: { socketId: string; username: string; x: number; y: number }) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      const current = api.getAppState().collaborators || new Map();
      const updated = new Map(current);
      updated.set(payload.socketId as SocketId, {
        username: payload.username,
        pointer: { x: payload.x, y: payload.y, tool: 'pointer' },
        color: colorForSocket(payload.socketId),
      });

      api.updateScene({ collaborators: updated } as any);
    });

    return () => {
      socket.off('presence-update');
      socket.off('draw-update');
      socket.off('cursor-move');
    };
  }, [socket]);

  
  const handleManualJoin = () => {
    if (!socket || !username) return;
    socket.emit('join-room', { roomId: roomId.toLowerCase(), username });
    setHasJoined(true);
  };

  const handleExcalidrawChange = (elements: readonly any[]) => {

    if (isApplyingRemoteUpdate.current) return;
    if (!socket) return;

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

  // Show loading screen while waiting for socket connection
  if (!hasJoined || isLoading) {
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

 return (
  <div className="h-screen w-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
    <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--surface)] text-sm shrink-0">
      <span className="font-display text-lg">{roomName || roomId}</span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          {participants
  .filter((p) => p.socketId !== socket?.id)
  .map((p) => (
    <span key={p.socketId} className="flex items-center gap-1">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: colorForSocket(p.socketId) }}
      />
      {p.username}
    </span>
  ))}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(window.location.href)}
          className="text-xs px-2 py-1 rounded-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
        >
          Copy link
        </button>
        <button
          onClick={toggleTheme}
          className="text-xs px-2 py-1 rounded-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </div>

    <div className="flex-1 min-h-0">
     <Excalidraw
  key={theme}
  excalidrawAPI={(api) => (excalidrawAPIRef.current = api)}
  onChange={handleExcalidrawChange}
  onPointerUpdate={handlePointerUpdate}
  theme={theme}
/>
    </div>
  </div>
);
}