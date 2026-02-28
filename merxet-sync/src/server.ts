import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { appDb } from './cache';
import uploadToBunnyRouter from './routes/api/upload-to-bunny';
import systemRouter from './routes/system';
import apiRouter from './routes/api';
import circleRouter from './routes/api/circle.routes';
import { sendJson } from './utils/respond';
import { networkParam } from './middleware/network';

export function createApp() {
  const app = express();

  // Request ID and simple logging
  app.use((req, _res, next) => {
    (req as any).id = randomUUID(); next(); });
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(JSON.stringify({
        id: (req as any).id,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start }));
    });
    next();
  });

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/', systemRouter);
  app.use('/api/cdn', uploadToBunnyRouter);
  app.use('/api/circle', circleRouter);

  // Register the :network param handler at the app level
  app.param('network', networkParam);

  app.use('/api/v1/:network', apiRouter);
  app.use('/api/:network', apiRouter);
  app.use((err: unknown, _req: Request, res: Response, _next: Function) => {
    const message = err instanceof Error ? err.message : 'Unknown error';
    sendJson(res, { success: false, error: message }, 500);
  });
  return app;
}

/**
 * Configure and start the Express server
 * @param port - The port to listen on
 * @returns A promise that resolves to the actual port the server is listening to
 */
export async function startServer(port: number): Promise<number> {
  const app = createApp();

  // Initialize the database
  await appDb.initialize();

  // Start the server
  return await new Promise<number>((resolve) => {
    const server = app.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? (address.port as number) : port;
      resolve(actualPort);
    });

    // Graceful shutdown hooks
    const close = async () => new Promise<void>((r) => server.close(() => r()));
    process.on('SIGINT', () => { close().then(() => process.exit(0)); });
    process.on('SIGTERM', () => { close().then(() => process.exit(0)); });
  });
}
