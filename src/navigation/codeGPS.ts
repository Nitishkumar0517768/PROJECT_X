import * as vscode from 'vscode';

/**
 * Code GPS — provides always-available position information.
 * "Where am I?" → file, function, line, total lines, error count.
 */
export class CodeGPS {
  /**
   * Get a spoken description of the current cursor position.
   */
  getCurrentPosition(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 'No file is currently open.';

    const doc = editor.document;
    const pos = editor.selection.active;
    const line = pos.line + 1;
    const totalLines = doc.lineCount;
    const fileName = doc.fileName.split(/[/\\]/).pop() || doc.fileName;

    // Count errors in this file
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    const errorCount = diagnostics.filter(
      d => d.severity === vscode.DiagnosticSeverity.Error
    ).length;

    // Find current scope
    const scope = this.findCurrentScope(doc, pos.line);

    let response = `You're in ${fileName}`;
    if (scope) {
      response += ` — inside ${scope}`;
    }
    response += `, line ${line} of ${totalLines}.`;

    if (errorCount > 0) {
      response += ` ${errorCount} ${errorCount === 1 ? 'error' : 'errors'} in this file.`;
    } else {
      response += ' No errors detected.';
    }

    return response;
  }

  /**
   * Find the function/class the cursor is inside.
   */
  private findCurrentScope(doc: vscode.TextDocument, line: number): string | null {
    for (let i = line; i >= 0; i--) {
      const text = doc.lineAt(i).text;

      const funcMatch = text.match(/(?:function|def|fn|func|async\s+function)\s+(\w+)/);
      if (funcMatch) return `the ${funcMatch[1]} function`;

      const classMatch = text.match(/(?:class|interface|struct)\s+(\w+)/);
      if (classMatch) return `the ${classMatch[1]} class`;

      const methodMatch = text.match(
        /(?:public|private|protected|static|async)?\s*(\w+)\s*\([^)]*\)\s*[:{]/
      );
      if (methodMatch && !text.includes('if') && !text.includes('for') && !text.includes('while')) {
        return `the ${methodMatch[1]} method`;
      }
    }
    return null;
  }
}
