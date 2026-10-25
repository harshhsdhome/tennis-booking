import { runMigrations } from './db/migrate';
import { config } from './config';
import app from './server';

async function main(): Promise<void> {
  await runMigrations();

  app.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
