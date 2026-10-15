import { execFile } from 'node:child_process';
import { DataError } from './validation.js';
export class GitError extends Error {
  constructor(readonly detail: string, readonly timedOut = false) { super('A Git operation could not finish.'); }
}
/** No shell, no interactive credential prompt, no hooks, and a deadline for every Git operation. */
export function git(cwd: string, args: string[], network = false, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd, signal, encoding: 'utf8', timeout: network ? 20000 : 10000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oConnectTimeout=8', LC_ALL: 'C' } }, (error, stdout, stderr) => {
      if (error) reject(new GitError(`${stderr}\n${stdout}\n${error.message}`, error.killed ?? false));
      else resolve(stdout.trim());
    });
  });
}
export function safeGitFailure(error: unknown): { phase: 'offline' | 'error'; message: string } {
  if (error instanceof GitError) {
    if (/authentication|permission denied|could not read Username|terminal prompts disabled|Repository not found|access denied|publickey/i.test(error.detail)) return { phase: 'error', message: 'GitHub access needs attention. Check the repository URL and your installed Git credentials, then retry.' };
    if (error.timedOut || /resolve host|resolve hostname|Failed to connect|Network is unreachable|Connection refused|Connection timed out|Could not connect|network/i.test(error.detail)) return { phase: 'offline', message: 'GitHub is unreachable. Your changes are saved on this machine; sync will retry automatically.' };
    return { phase: 'error', message: 'Git sync could not finish. Your local tasks are safe. Check the repository and retry.' };
  }
  return { phase: 'error', message: error instanceof DataError ? error.message : 'Sync could not finish. Your local tasks are safe.' };
}
