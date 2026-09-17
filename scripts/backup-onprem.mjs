import { mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for an on-premise backup');

const backupDirectory = path.resolve(process.env.ONPREM_BACKUP_DIR || './backups');
await mkdir(backupDirectory, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outputFile = path.join(backupDirectory, `tovapos-${stamp}.dump`);

await new Promise((resolve, reject) => {
  const child = spawn(
    'pg_dump',
    ['--format=custom', '--no-owner', '--file', outputFile, databaseUrl],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
    }
  );
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`pg_dump exited with code ${code ?? 'unknown'}`));
  });
});

const backup = await stat(outputFile);
if (backup.size <= 0) throw new Error('Backup was created but is empty');
console.log(`On-premise backup created: ${outputFile} (${backup.size} bytes)`);
