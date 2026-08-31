'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSocket } from '@/hooks/useSocket';
import '@excalidraw/excalidraw/index.css';

const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

interface Participant {
  socketId: string;
  username: string;
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { socket, isConnected } = useSocket();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('presence-update', (updatedParticipants: Participant[]) => {
      setParticipants(updatedParticipants);
    });

    return () => {
      socket.off('presence-update');
    };
  }, [socket]);

  const handleJoin = () => {
    if (!socket || !username) return;
    socket.emit('join-room', { roomId, username });
    setHasJoined(true);
  };

  if (!hasJoined) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Room: {roomId}</h1>
        <p className="mb-4">
          Status: {isConnected ? ' Connected' : ' Disconnected'}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border px-3 py-2 rounded"
          />
          <button
            onClick={handleJoin}
            className="bg-black text-white px-4 py-2 rounded"
          >
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
      <Excalidraw />
    </div>
  );
}