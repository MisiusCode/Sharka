import type { Response } from 'express';

export interface EventHub {
  subscribe(res: Response): () => void;
  broadcast(type: string): void;
  count(): number;
}

export function createEventHub(): EventHub {
  const clients = new Set<Response>();

  return {
    subscribe(res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      clients.add(res);
      return () => { clients.delete(res); };
    },

    broadcast(type) {
      const payload = `data: ${JSON.stringify({ type })}\n\n`;
      for (const res of clients) {
        try {
          res.write(payload);
        } catch {
          clients.delete(res); // miręs klientas neturi nutraukti likusiųjų
        }
      }
    },

    count: () => clients.size,
  };
}
