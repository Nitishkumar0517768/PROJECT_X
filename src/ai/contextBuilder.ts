import * as vscode from 'vscode';
import { SessionMemory } from './sessionMemory';

/**
 * Context Builder — assembles rich project context for every AI call.
 * Follows the PRD's context injection template.
 */
export class ContextBuilder {
  constructor(private sessionMemory: SessionMemory) {}

  /**
   * Build full context string for the current editor state.
   */
  async buildContext(): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 'No file is currently open.';

    const doc = editor.document;
    const pos = editor.selection.active;
    const line = pos.line;
    const col = pos.character;
    const totalLines = doc.lineCount;
    const fileName = doc.fileName.split(/[/\\]/).pop() || doc.fileName;
    const language = doc.languageId;

    // Get surrounding code (±10 lines)
    const startLine = Math.max(0, line - 10);
    const endLine = Math.min(totalLines - 1, line + 10);
    let codeContext = '';
    for (let i = startLine; i <= endLine; i++) {
      const prefix = i === line ? '>>> ' : '    ';
      codeContext += `${prefix}${i + 1}: ${doc.lineAt(i).text}\n`;
    }

    // Get diagnostics (errors/warnings)
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    const errors = diagnostics
      .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
      .map(d => `Line ${d.range.start.line + 1}: ${d.message}`)
      .slice(0, 5);
    const warnings = diagnostics
      .filter(d => d.severity === vscode.DiagnosticSeverity.Warning)
      .map(d => `Line ${d.range.start.line + 1}: ${d.message}`)
      .slice(0, 5);

    // Get scope (simple bracket-based)
    const scopePath = this.getScopePath(doc, line);

    // Session history
    const recentActions = this.sessionMemory.getRecentActions(5);
    const checkpoints = this.sessionMemory.getCheckpointNames();

    return `Current State:
File: ${fileName} (${language}) | Total lines: ${totalLines}
Cursor: Line ${line + 1}, Column ${col + 1}
Current scope: ${scopePath}
Active errors: ${errors.length > 0 ? errors.join('; ') : 'None'}
Active warnings: ${warnings.length > 0 ? warnings.join('; ') : 'None'}
Recent actions: ${recentActions.length > 0 ? recentActions.join(', ') : 'None'}
Checkpoints: ${checkpoints.length > 0 ? checkpoints.join(', ') : 'None'}

Nearby code (>>> marks current line):
${codeContext}`;
  }

  /**
   * Get a human-readable scope path for the cursor position.
   */
  private getScopePath(doc: vscode.TextDocument, line: number): string {
    const scopes: string[] = [];

    for (let i = line; i >= 0; i--) {
      const text = doc.lineAt(i).text;

      // Look for function/class/method declarations
      const funcMatch = text.match(/(?:function|def|fn|func|async\s+function)\s+(\w+)/);
      const classMatch = text.match(/(?:class|interface|struct)\s+(\w+)/);
      const methodMatch = text.match(/(?:public|private|protected|static|async)?\s*(\w+)\s*\(.*\)\s*[:{]/);

      if (funcMatch && scopes.length === 0) {
        scopes.unshift(`function ${funcMatch[1]}`);
      } else if (classMatch) {
        scopes.unshift(`class ${classMatch[1]}`);
        break;
      } else if (methodMatch && scopes.length === 0 && !text.includes('if') && !text.includes('for') && !text.includes('while')) {
        scopes.unshift(`method ${methodMatch[1]}`);
      }
    }

    return scopes.length > 0 ? scopes.join(' → ') : 'global scope';
  }
}
