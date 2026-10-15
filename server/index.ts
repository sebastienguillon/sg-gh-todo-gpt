import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { DataStore } from './store.js';
import { DataError } from './validation.js';

async function main() {
  const projectDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const dataDir = resolve(process.env.GH_TODO_DATA_DIR ?? resolve(projectDir, '.gh-todo-data'));
  if (dataDir === projectDir) throw new DataError('Task data must use a separate directory from the application source.');
  const port = Number(process.env.GH_TODO_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new DataError('GH_TODO_PORT must be a port between 1024 and 65535.');
  const store = await DataStore.open({ dataDir });
  const app = createApp(store, { port, production: true });
  const server = app.listen(port, '127.0.0.1', () => console.log(`GH to-do local service: http://127.0.0.1:${port}`));
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { void store.close().then(() => process.exit(0)); });
    setTimeout(() => process.exit(0), 25000).unref();
  };
  server.on('error', error => { console.error(error.message); void store.close().finally(() => process.exit(1)); });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch(error => {
  // Setup failures are plain app messages; underlying Git output may contain sensitive URLs.
  console.error(error instanceof DataError ? error.message : 'The local Git data store could not start. Check installed Git and write access to its data directory.');
  process.exitCode = 1;
});
