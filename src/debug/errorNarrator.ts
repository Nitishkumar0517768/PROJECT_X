import * as vscode from 'vscode';
import { GeminiClient } from '../ai/geminiClient';
import { ContextBuilder } from '../ai/contextBuilder';

/**
 * Error Narrator — fetches LSP diagnostics and narrates them in plain English.
 */
export class ErrorNarrator {
  constructor(
    private aiClient: GeminiClient,
    private contextBuilder: ContextBuilder
  ) {}

  /**
   * Narrate errors in the current file.
   * Returns a spoken description or null if no errors.
   */
  async narrateErrors(): Promise<string | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    if (diagnostics.length === 0) return null;

    // Sort by severity (errors first)
    const sorted = [...diagnostics].sort((a, b) => a.severity - b.severity);

    // Get top 3 most critical
    const top = sorted.slice(0, 3);

    // Build a summary for simple cases
    if (top.length === 1) {
      const d = top[0];
      const line = d.range.start.line + 1;
      const severity = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning';
      const lineText = editor.document.lineAt(d.range.start.line).text.trim();

      // Use AI for plain English explanation
      const context = await this.contextBuilder.buildContext();
      const aiExplanation = await this.aiClient.codeQuery(
        `Explain this ${severity} in plain English for a blind developer. 
         Line ${line}: "${lineText}"
         Error message: "${d.message}"
         Keep it under 3 sentences. Be precise about what's wrong and how to fix it.`,
        context
      );

      return aiExplanation || `Found a ${severity} on line ${line}: ${d.message}. Want me to take you there?`;
    }

    // Multiple errors
    const errorCount = sorted.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
    const warningCount = sorted.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;

    let summary = `I found ${diagnostics.length} issues: ${errorCount} ${errorCount === 1 ? 'error' : 'errors'} and ${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}. `;

    // Describe the most critical one
    const critical = top[0];
    const critLine = critical.range.start.line + 1;
    summary += `The most critical: ${critical.message}, on line ${critLine}. `;
    summary += `Want me to take you there?`;

    return summary;
  }
}
