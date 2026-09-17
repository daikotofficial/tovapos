import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const output = path.join(root, 'onprem-dist');
const standalone = path.join(root, '.next', 'standalone');

const build = spawnSync('npm', ['run', 'build:onprem'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Dereference Next's standalone workspace links. Windows installers cannot
// copy Linux/WSL symlinks from a UNC project path reliably.
await cp(standalone, output, { recursive: true, dereference: true });
await cp(path.join(root, '.next', 'static'), path.join(output, '.next', 'static'), {
  recursive: true,
});
await cp(path.join(root, 'public'), path.join(output, 'public'), { recursive: true });
await cp(path.join(root, '.env.onprem.example'), path.join(output, '.env.example'));

const readme = `# TOVAPOS on-premise package

1. Copy .env.example to .env.local and set the local PostgreSQL connection details.
2. Install PostgreSQL on the server computer and create the configured database/user.
3. Start the server with PORT=4028 and HOSTNAME=0.0.0.0.
4. Open http://SERVER-LAN-IP:4028 from cashier computers on the same network.
5. Configure a second backup destination before production use.

The final Windows installer will automate PostgreSQL installation, first-run setup, firewall rules, and shortcuts. This package is the testable application payload.
`;
await writeFile(path.join(output, 'README.md'), readme);

const packageJson = JSON.parse(await readFile(path.join(output, 'package.json'), 'utf8'));
console.log(`On-premise package created at ${output}`);
console.log(`Standalone server: ${packageJson.name ?? 'tovapos'}/server.js`);
