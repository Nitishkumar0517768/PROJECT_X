import * as vscode from 'vscode';
import { execSync, exec } from 'child_process';

/**
 * Checkpoint Manager — named Git checkpoints for conversational undo.
 * "Create checkpoint called 'before refactor'"
 * "Undo everything since 'before refactor'"
 */
export class CheckpointManager {
  /**
   * Create a named checkpoint (Git commit).
   */
  async create(name: string): Promise<string> {
    const cwd = this.getWorkspaceRoot();
    if (!cwd) return 'No workspace folder open.';

    try {
      // Stage all changes
      execSync('git add -A', { cwd, stdio: 'pipe' });
      // Commit with checkpoint name
      const commitMsg = `[BlindCode Checkpoint] ${name}`;
      execSync(`git commit -m "${commitMsg}" --allow-empty`, { cwd, stdio: 'pipe' });
      return `Checkpoint "${name}" saved.`;
    } catch (err: any) {
      // Check if git is initialized
      try {
        execSync('git status', { cwd, stdio: 'pipe' });
      } catch {
        // Initialize git
        execSync('git init', { cwd, stdio: 'pipe' });
        execSync('git add -A', { cwd, stdio: 'pipe' });
        execSync(`git commit -m "[BlindCode Checkpoint] ${name}"`, { cwd, stdio: 'pipe' });
        return `Git initialized and checkpoint "${name}" saved.`;
      }
      return `Could not create checkpoint: ${err.message}`;
    }
  }

  /**
   * List available checkpoints.
   */
  async list(): Promise<string[]> {
    const cwd = this.getWorkspaceRoot();
    if (!cwd) return [];

    try {
      const output = execSync(
        'git log --oneline --grep="\\[BlindCode Checkpoint\\]" -20',
        { cwd, stdio: 'pipe', encoding: 'utf-8' }
      );

      return output
        .trim()
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => {
          const match = line.match(/\[BlindCode Checkpoint\]\s*(.+)/);
          return match ? match[1] : line;
        });
    } catch {
      return [];
    }
  }

  /**
   * Restore to a named checkpoint.
   */
  async restore(name: string): Promise<string> {
    const cwd = this.getWorkspaceRoot();
    if (!cwd) return 'No workspace folder open.';

    try {
      // Find the commit hash for this checkpoint
      const output = execSync(
        `git log --oneline --grep="\\[BlindCode Checkpoint\\] ${name}" -1`,
        { cwd, stdio: 'pipe', encoding: 'utf-8' }
      );

      const hash = output.trim().split(' ')[0];
      if (!hash) return `Checkpoint "${name}" not found.`;

      // Reset to that commit
      execSync(`git reset --hard ${hash}`, { cwd, stdio: 'pipe' });
      return `Restored to checkpoint "${name}". All changes after this point have been undone.`;
    } catch (err: any) {
      return `Could not restore checkpoint: ${err.message}`;
    }
  }

  private getWorkspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }
}
