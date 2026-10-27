import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const serviceDirectory = join(root, 'ai-service');
const python = join(root, 'ai-service', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python)) {
  console.error('Missing ai-service virtual environment. Create ai-service/.venv with Python 3.11–3.13 first.');
  process.exit(1);
}

const action = process.argv[2];
const commands = {
  install: ['-m', 'pip', 'install', '--prefer-binary', '-e', '.'],
  dev: ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'],
  check: ['-m', 'compileall', '-q', 'app', 'scripts'],
};
const args = commands[action];
if (!args) {
  console.error(`Unknown AI service action: ${action ?? '(missing)'}`);
  process.exit(1);
}

const child = spawn(python, args, { cwd: serviceDirectory, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exitCode = signal ? 1 : (code ?? 1));
