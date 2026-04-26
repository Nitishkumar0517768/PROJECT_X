import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Landmark {
  name: string;
  file: string;
  line: number;
}

/**
 * Landmark Manager — named audio beacons at code locations.
 */
export class LandmarkManager {
  private landmarks: Landmark[] = [];

  constructor() {
    this.load();
  }

  /**
   * Drop a landmark at the current cursor position.
   */
  drop(name: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const landmark: Landmark = {
      name,
      file: editor.document.uri.fsPath,
      line: editor.selection.active.line,
    };

    // Remove existing landmark with same name
    this.landmarks = this.landmarks.filter(l => l.name !== name);
    this.landmarks.push(landmark);
    this.save();
  }

  /**
   * List all landmarks.
   */
  list(): Landmark[] {
    return [...this.landmarks];
  }

  /**
   * Navigate to a named landmark.
   */
  async goTo(name: string): Promise<boolean> {
    const landmark = this.landmarks.find(l => l.name === name);
    if (!landmark) return false;

    try {
      const doc = await vscode.workspace.openTextDocument(landmark.file);
      const editor = await vscode.window.showTextDocument(doc);
      const position = new vscode.Position(landmark.line, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove a landmark.
   */
  remove(name: string): void {
    this.landmarks = this.landmarks.filter(l => l.name !== name);
    this.save();
  }

  private getLandmarksPath(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;
    return path.join(workspaceFolder.uri.fsPath, '.blindcode', 'landmarks.json');
  }

  private save(): void {
    const filePath = this.getLandmarksPath();
    if (!filePath) return;
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(this.landmarks, null, 2));
    } catch (err) {
      console.error('[BlindCode] Failed to save landmarks:', err);
    }
  }

  private load(): void {
    const filePath = this.getLandmarksPath();
    if (!filePath || !fs.existsSync(filePath)) return;
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      this.landmarks = JSON.parse(data);
    } catch {
      this.landmarks = [];
    }
  }
}
