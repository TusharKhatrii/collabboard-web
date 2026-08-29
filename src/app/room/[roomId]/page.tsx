'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Room: {roomId}</h1>
      <p className="mb-4">
        Status: {isConnected ? ' Connected' : ' Disconnected'}
      </p>

      {!hasJoined ? (
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
      ) : (
        <div>
          <h2 className="font-semibold mb-2">Participants ({participants.length}):</h2>
          <ul>
            {participants.map((p) => (
              <li key={p.socketId}>
                {p.username} {p.socketId === socket?.id && '(you)'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}