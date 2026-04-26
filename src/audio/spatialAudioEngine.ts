import * as vscode from 'vscode';

export interface AudioParams {
  frequency: number;
  stereo: number;
  duration: number;
  texture: string;
  volume: number;
}

/**
 * Spatial Audio Engine — sends play commands to the webview's Web Audio API.
 */
export class SpatialAudioEngine {
  private webview: vscode.Webview | undefined;
  private enabled: boolean = true;
  private lastPlayTime: number = 0;
  private readonly DEBOUNCE_MS = 50;

  setWebview(webview: vscode.Webview): void {
    this.webview = webview;
  }

  /**
   * Play a spatial tone via the webview's Web Audio API.
   */
  play(params: AudioParams): void {
    if (!this.enabled || !this.webview) return;

    // Debounce rapid cursor movements
    const now = Date.now();
    if (now - this.lastPlayTime < this.DEBOUNCE_MS) return;
    this.lastPlayTime = now;

    this.webview.postMessage({
      type: 'playTone',
      frequency: params.frequency,
      stereo: params.stereo,
      duration: params.duration,
      texture: params.texture,
      volume: params.volume,
    });
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
