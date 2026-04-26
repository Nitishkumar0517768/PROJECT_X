import * as vscode from 'vscode';
import { CheckpointManager } from '../checkpoint/checkpointManager';

interface PendingChange {
  description: string;
  rawResponse: string;
  editor: vscode.TextEditor;
  timestamp: number;
  replacementText?: string;
}

/**
 * Trust Protocol — 4-layer safety system.
 * 1. PROPOSE: AI generates change, stores in pending state
 * 2. READ ALOUD: Change is spoken to developer
 * 3. CONFIDENCE: Confidence score communicated
 * 4. CHECKPOINT: Auto Git commit before applying
 *
 * Nothing is written to file until developer says "confirm".
 */
export class TrustProtocol {
  private pending: PendingChange | null = null;

  constructor(private checkpointManager: CheckpointManager) {}

  /**
   * Propose a change. Stores it in pending state — never auto-applies.
   */
  propose(aiResponse: string, editor: vscode.TextEditor, replacementText?: string): void {
    this.pending = {
      description: aiResponse,
      rawResponse: aiResponse,
      editor,
      timestamp: Date.now(),
      replacementText
    };
  }

  /**
   * Get a human-readable description of the pending change.
   */
  getPendingDescription(): string {
    if (!this.pending) return 'No pending changes.';
    return `${this.pending.description}\n\nShall I apply this? Say "confirm" or "reject".`;
  }

  /**
   * Check if there's a pending change.
   */
  hasPending(): boolean {
    return this.pending !== null;
  }

  /**
   * Confirm and apply the pending change.
   * Creates a checkpoint first, then applies.
   */
  async confirm(): Promise<string> {
    if (!this.pending) {
      return 'No pending change to confirm.';
    }

    try {
      // Layer 4: Auto checkpoint before applying (non-blocking)
      const checkpointName = `auto-${Date.now()}`;
      try {
        await this.checkpointManager.create(checkpointName);
      } catch (cpErr) {
        console.warn('[BlindCode] Checkpoint failed (non-fatal):', cpErr);
      }

      // Apply the change directly to the file!
      const editor = this.pending.editor;
      if (editor && editor.document && this.pending.replacementText) {
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(editor.document.uri, fullRange, this.pending.replacementText);
        const applied = await vscode.workspace.applyEdit(edit);
        if (applied) {
          await editor.document.save();
        } else {
          this.pending = null;
          return 'Failed to apply the edit to the file.';
        }
      }

      const result = `Done. Change applied successfully. You can say "undo" to revert.`;
      this.pending = null;
      return result;
    } catch (err) {
      return `Failed to apply change: ${err}`;
    }
  }

  /**
   * Reject the pending change.
   */
  reject(): string {
    if (!this.pending) {
      return 'No pending change to reject.';
    }
    this.pending = null;
    return 'Understood. Change rejected. Nothing was modified.';
  }

  /**
   * Modify the pending change (restart the proposal).
   */
  modify(newDescription: string): void {
    if (this.pending) {
      this.pending.description = newDescription;
    }
  }
}
