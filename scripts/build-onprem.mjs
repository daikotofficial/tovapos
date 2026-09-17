import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DEPLOYMENT_MODE: 'onprem' },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
