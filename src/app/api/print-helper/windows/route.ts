import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function GET() {
  const helperPath = path.join(process.cwd(), 'public', 'tovapos-printer-helper', 'TOVAPOS-Printer-Helper.ps1');
  const helper = (await readFile(helperPath)).toString('base64');
  const batch = [
    '@echo off',
    'setlocal',
    'set "helper=%TEMP%\\TOVAPOS-Printer-Helper.ps1"',
    `powershell.exe -NoProfile -Command "$bytes=[Convert]::FromBase64String('${helper}'); [IO.File]::WriteAllBytes($env:TEMP + '\\TOVAPOS-Printer-Helper.ps1',$bytes)"`,
    'powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%helper%" -Install',
    'echo.',
    'echo TOVAPOS Printer Helper installed for this Windows user.',
    '',
  ].join('\r\n');
  return new Response(batch, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="TOVAPOS-Printer-Helper.cmd"',
      'Cache-Control': 'no-store',
    },
  });
}
