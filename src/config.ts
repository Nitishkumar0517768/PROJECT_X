import * as vscode from 'vscode';

/**
 * BlindCode configuration wrapper.
 * Reads all settings from VS Code's configuration system.
 */
export class BlindCodeConfig {
  private static get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('blindcode');
  }

  static get geminiApiKey(): string {
    return this.config.get<string>('geminiApiKey', '');
  }

  static get groqApiKey(): string {
    return this.config.get<string>('groqApiKey', '');
  }

  static get speechRate(): number {
    return this.config.get<number>('speechRate', 0.85);
  }

  static set speechRate(rate: number) {
    this.config.update('speechRate', Math.max(0.3, Math.min(3.0, rate)), vscode.ConfigurationTarget.Global);
  }

  static get audioVolume(): number {
    return this.config.get<number>('audioVolume', 0.6);
  }

  static get spatialAudioEnabled(): boolean {
    return this.config.get<boolean>('spatialAudioEnabled', true);
  }

  static get primaryAiProvider(): 'gemini' | 'groq' {
    return this.config.get<'gemini' | 'groq'>('primaryAiProvider', 'gemini');
  }

  /**
   * Check if the extension has the minimum configuration to work.
   */
  static isConfigured(): boolean {
    return this.geminiApiKey.length > 0 || this.groqApiKey.length > 0;
  }

  /**
   * Listen for configuration changes.
   */
  static onDidChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('blindcode')) {
        callback();
      }
    });
  }
}
