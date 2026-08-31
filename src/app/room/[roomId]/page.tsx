'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSocket } from '@/hooks/useSocket';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { SocketId } from '@excalidraw/excalidraw/types';

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
  const { socket, isConnected } = useSocket();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);

  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const isApplyingRemoteUpdate = useRef(false);

  // throttle state: always holds the LATEST pending payload, not a stale one
  const pendingElementsRef = useRef<any>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('presence-update', (updatedParticipants: Participant[]) => {
      setParticipants(updatedParticipants);
    });

    socket.on('draw-update', async (remoteElements) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      // dynamic import so this stays out of the SSR bundle
      const { reconcileElements } = await import('@excalidraw/excalidraw');

      const localElements = api.getSceneElementsIncludingDeleted();
      const appState = api.getAppState();

      const reconciled = reconcileElements(localElements, remoteElements, appState);

      isApplyingRemoteUpdate.current = true;
      api.updateScene({ elements: reconciled });
      setTimeout(() => {
        isApplyingRemoteUpdate.current = false;
      }, 0);
    });

    socket.on('draw-update', async (remoteElements) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      const { reconcileElements } = await import('@excalidraw/excalidraw');

      const localElements = api.getSceneElementsIncludingDeleted();
      const appState = api.getAppState();

      const reconciled = reconcileElements(localElements, remoteElements, appState);

      isApplyingRemoteUpdate.current = true;
      api.updateScene({ elements: reconciled });
      setTimeout(() => {
        isApplyingRemoteUpdate.current = false;
      }, 0);
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

  const handleJoin = () => {
    if (!socket || !username) return;
    socket.emit('join-room', { roomId, username });
    setHasJoined(true);
  };



  const handleExcalidrawChange = (elements: readonly any[]) => {

    if (isApplyingRemoteUpdate.current) return;
    if (!socket) return;

    pendingElementsRef.current = elements;

    if (throttleTimerRef.current) return;

    throttleTimerRef.current = setTimeout(() => {
      socket.emit('draw-update', { roomId, elements: pendingElementsRef.current });
      throttleTimerRef.current = null;
    }, 80);
  };

  const handlePointerUpdate = (payload: { pointer: { x: number; y: number } }) => {
    if (!socket) return;
    if (cursorThrottleRef.current) return;

    cursorThrottleRef.current = setTimeout(() => {
      socket.emit('cursor-move', {
        roomId,
        socketId: socket.id,
        username,
        x: payload.pointer.x,
        y: payload.pointer.y,
      });
      cursorThrottleRef.current = null;
    }, 50);
  };


  if (!hasJoined) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Room: {roomId}</h1>
        <p className="mb-4">Status: {isConnected ? ' Connected' : ' Disconnected'}</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border px-3 py-2 rounded"
          />
          <button onClick={handleJoin} className="bg-black text-white px-4 py-2 rounded">
            Join Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <div className="absolute top-2 left-2 z-10 bg-white/90 px-3 py-1 rounded shadow text-sm">
        {participants.length} online: {participants.map((p) => p.username).join(', ')}
      </div>
      <Excalidraw
        excalidrawAPI={(api) => (excalidrawAPIRef.current = api)}
        onChange={handleExcalidrawChange}
        onPointerUpdate={handlePointerUpdate}
      />
    </div>
  );
}