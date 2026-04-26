import * as vscode from 'vscode';

/**
 * Symbol Navigator — navigate to functions, classes, variables by name.
 * Uses VS Code's built-in document symbol provider.
 */
export class SymbolNavigator {
  /**
   * Navigate to a named symbol (function, class, variable).
   */
  async navigateTo(target: string): Promise<string | null> {
    // Handle "line:N" targets
    const lineMatch = target.match(/^line:(\d+)$/);
    if (lineMatch) {
      return this.goToLine(parseInt(lineMatch[1], 10));
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return 'No file is open.';

    // Search in current document first
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      editor.document.uri
    );

    if (symbols) {
      const match = this.findSymbol(symbols, target);
      if (match) {
        const position = match.range.start;
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(match.range, vscode.TextEditorRevealType.InCenter);
        return `Arrived at ${match.name}, line ${position.line + 1}.`;
      }
    }

    // Search across workspace
    const workspaceSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      target
    );

    if (workspaceSymbols && workspaceSymbols.length > 0) {
      const best = workspaceSymbols[0];
      const doc = await vscode.workspace.openTextDocument(best.location.uri);
      const newEditor = await vscode.window.showTextDocument(doc);
      const pos = best.location.range.start;
      newEditor.selection = new vscode.Selection(pos, pos);
      newEditor.revealRange(best.location.range, vscode.TextEditorRevealType.InCenter);

      const fileName = best.location.uri.fsPath.split(/[/\\]/).pop();
      return `Found ${best.name} in ${fileName}, line ${pos.line + 1}.`;
    }

    return `Could not find "${target}". Try a different name.`;
  }

  /**
   * Go to a specific line number.
   */
  private goToLine(line: number): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 'No file is open.';

    const targetLine = Math.max(0, Math.min(line - 1, editor.document.lineCount - 1));
    const position = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
    return `Moved to line ${targetLine + 1}.`;
  }

  /**
   * Recursively find a symbol by fuzzy name matching.
   */
  private findSymbol(
    symbols: vscode.DocumentSymbol[],
    target: string
  ): vscode.DocumentSymbol | null {
    const normalized = target.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const symbol of symbols) {
      const symbolName = symbol.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (symbolName === normalized || symbolName.includes(normalized)) {
        return symbol;
      }
      // Search children
      if (symbol.children) {
        const child = this.findSymbol(symbol.children, target);
        if (child) return child;
      }
    }
    return null;
  }
}
