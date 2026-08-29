'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL!);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected');
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { socket: socketRef.current, isConnected };
}