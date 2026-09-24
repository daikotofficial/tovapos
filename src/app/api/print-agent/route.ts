import { spawn } from 'node:child_process';
import path from 'node:path';
import { NextResponse } from 'next/server';

const state = globalThis as typeof globalThis & { __tovaposPrintAgent?: ReturnType<typeof spawn> };
const agentPath = () => process.env.DEPLOYMENT_MODE === 'onprem'
  ? path.join(process.cwd(), 'print-agent.mjs')
  : path.join(process.cwd(), 'scripts', 'print-agent.mjs');

async function health() {
  try {
    const response = await fetch('http://127.0.0.1:4318/health', { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function GET() {
  const printer = await health();
  return NextResponse.json({ running: Boolean(printer), printer });
}

export async function POST() {
  const existing = await health();
  if (existing) return NextResponse.json({ running: true, printer: existing });
  if (!state.__tovaposPrintAgent || state.__tovaposPrintAgent.exitCode !== null) {
    state.__tovaposPrintAgent = spawn(process.execPath, [agentPath()], { cwd: process.cwd(), stdio: 'ignore', env: process.env });
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const printer = await health();
    if (printer) return NextResponse.json({ running: true, printer });
  }
  return NextResponse.json({ running: false, error: 'Printer service did not start.' }, { status: 503 });
}
