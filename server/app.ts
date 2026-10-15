import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataStore } from './store.js';
import { GitError } from './git.js';
import { InputError, object, validateRemote } from './validation.js';

export interface AppOptions { port?: number; devPort?: number; production?: boolean; distDir?: string }
export function createApp(store: DataStore, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const ports = new Set([request.socket.localPort, options.port, options.devPort ?? 5173].filter(Boolean));
    const allowed = (input: string, origin = false): boolean => {
      try {
        const url = new URL(origin ? input : `http://${input}`);
        return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && !url.username && !url.password && ports.has(Number(url.port || 80)) && (!origin || url.origin === input);
      } catch { return false; }
    };
    if (!request.headers.host || !allowed(request.headers.host) || (request.headers.origin !== undefined && !allowed(request.headers.origin, true))) return response.status(403).json({ error: 'This local app only accepts requests from its own loopback address.' });
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Cache-Control', 'no-store');
    if (request.path.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !request.is('application/json')) return response.status(415).json({ error: 'Send writes as application/json.' });
    next();
  });
  app.use(express.json({ limit: '128kb', strict: true }));
  app.get('/api/state', (_request, response) => response.json(store.state()));
  app.post('/api/tasks', async (request, response) => {
    const body = object(request.body);
    response.status(201).json(await store.addTask({ id: body.id, title: body.title, listId: body.listId }));
  });
  app.patch('/api/tasks/:id', async (request, response) => {
    const body = object(request.body);
    response.json(await store.patchTask(request.params.id, body.changes, body.baseHeads));
  });
  app.post('/api/lists', async (request, response) => {
    const body = object(request.body);
    response.status(201).json(await store.addList({ id: body.id, name: body.name }));
  });
  app.patch('/api/lists/:id', async (request, response) => {
    const body = object(request.body);
    response.json(await store.patchList(request.params.id, body.changes, body.baseHeads));
  });
  app.post('/api/conflicts/:id/resolve', async (request, response) => {
    const body = object(request.body);
    response.json(await store.resolveConflict(request.params.id, body.value));
  });
  app.post('/api/demo', async (_request, response) => response.json(await store.addDemo()));
  app.delete('/api/demo', async (_request, response) => response.json(await store.removeDemo()));
  app.post('/api/sync', (_request, response) => { void store.syncNow(); response.json(store.state()); });
  app.put('/api/remote', async (request, response) => {
    const body = object(request.body);
    await store.setRemote(validateRemote(body.url));
    void store.syncNow();
    response.json(store.state());
  });
  app.use('/api', (_request, response) => response.status(404).json({ error: 'This API endpoint does not exist.' }));
  const distDir = options.distDir ?? resolve(fileURLToPath(new URL('../dist', import.meta.url)));
  if (options.production && existsSync(resolve(distDir, 'index.html'))) {
    app.use((_request, response, next) => { response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"); next(); });
    app.use(express.static(distDir, { index: false }));
    app.get('/{*path}', (_request, response) => response.sendFile(resolve(distDir, 'index.html')));
  } else app.use((_request, response) => response.status(404).json({ error: 'Start the frontend with pnpm dev, or build it with pnpm build before pnpm start.' }));
  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof SyntaxError) { response.status(400).json({ error: 'The request is not valid JSON.' }); return; }
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') { response.status(413).json({ error: 'This edit is too large. Notes can contain up to 20,000 characters.' }); return; }
    if (error instanceof InputError) { response.status(400).json({ error: error.message }); return; }
    // Never send raw Git output, filesystem paths, environment, or credentials to the browser.
    response.status(500).json({ error: error instanceof GitError ? 'Git could not finish this operation. Your saved tasks have been preserved.' : 'This change could not be saved. Your previous data is preserved; keep your draft and retry.' });
  };
  app.use(errors);
  return app;
}
