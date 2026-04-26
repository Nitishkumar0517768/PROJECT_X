import * as vscode from 'vscode';

/**
 * Checkpoint Manager — In-memory file snapshots for safe undo.
 * No Git dependency. Stores file content before each AI edit
 * so the developer can instantly revert with "undo".
 */

interface Checkpoint {
  name: string;
  fileUri: vscode.Uri;
  content: string;
  timestamp: number;
}

export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private readonly MAX_CHECKPOINTS = 20;

  /**
   * Create a named checkpoint by saving the current file's content in memory.
   */
  async create(name: string): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 'No file open to checkpoint.';

    const content = editor.document.getText();
    const fileUri = editor.document.uri;

    this.checkpoints.push({
      name,
      fileUri,
      content,
      timestamp: Date.now()
    });

    // Keep only the last N checkpoints
    if (this.checkpoints.length > this.MAX_CHECKPOINTS) {
      this.checkpoints.shift();
    }

    console.log(`[BlindCode] Checkpoint "${name}" saved (${content.length} chars)`);
    return `Checkpoint "${name}" saved.`;
  }

  /**
   * List available checkpoints.
   */
  async list(): Promise<string[]> {
    return this.checkpoints.map(cp => cp.name);
  }

  /**
   * Restore the most recent checkpoint (or a named one).
   */
  async restore(name?: string): Promise<string> {
    let checkpoint: Checkpoint | undefined;

    if (name) {
      // Find by name (search from newest to oldest)
      for (let i = this.checkpoints.length - 1; i >= 0; i--) {
        if (this.checkpoints[i].name.includes(name)) {
          checkpoint = this.checkpoints[i];
          break;
        }
      }
    } else {
      // Just get the most recent one
      checkpoint = this.checkpoints[this.checkpoints.length - 1];
    }

    if (!checkpoint) {
      return name ? `Checkpoint "${name}" not found.` : 'No checkpoints available.';
    }

    try {
      // Open the document and replace its content
      const doc = await vscode.workspace.openTextDocument(checkpoint.fileUri);
      const editor = await vscode.window.showTextDocument(doc);

      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
      );

      const edit = new vscode.WorkspaceEdit();
      edit.replace(checkpoint.fileUri, fullRange, checkpoint.content);
      await vscode.workspace.applyEdit(edit);
      await doc.save();

      // Remove this checkpoint and all newer ones
      const idx = this.checkpoints.indexOf(checkpoint);
      if (idx >= 0) {
        this.checkpoints = this.checkpoints.slice(0, idx);
      }

      return `Restored to checkpoint "${checkpoint.name}". File reverted successfully.`;
    } catch (err: any) {
      return `Could not restore: ${err.message}`;
    }
  }
}
