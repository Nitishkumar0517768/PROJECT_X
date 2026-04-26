import * as vscode from 'vscode';

/**
 * Voice Input — controls push-to-talk via webview SpeechRecognition.
 */
export class VoiceInput {
  private webview: vscode.Webview | undefined;
  private listening: boolean = false;

  setWebview(webview: vscode.Webview): void {
    this.webview = webview;
  }

  /** Toggle listening on/off */
  toggle(): void {
    if (!this.webview) {
      vscode.window.showWarningMessage('BlindCode panel not open. Click the BlindCode icon in the sidebar.');
      return;
    }
    this.listening = !this.listening;
    this.webview.postMessage({ type: 'toggleListening' });
  }

  start(): void {
    if (!this.webview) return;
    this.listening = true;
    this.webview.postMessage({ type: 'startListening' });
  }

  stop(): void {
    if (!this.webview) return;
    this.listening = false;
    this.webview.postMessage({ type: 'stopListening' });
  }

  isListening(): boolean {
    return this.listening;
  }
}
