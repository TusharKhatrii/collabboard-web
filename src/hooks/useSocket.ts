'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL!);
    let mounted = true;

    socket.on('connect', () => {
      if (!mounted) return;
      setSocket(socket);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      if (!mounted) return;
      setIsConnected(false);
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, []);

  return { socket, isConnected };
}