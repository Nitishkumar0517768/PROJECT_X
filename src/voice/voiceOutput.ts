import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { BlindCodeConfig } from '../config';

/**
 * Voice Output — System-level TTS using Windows SAPI.
 * No webview dependency. Works even without sidebar panel open.
 * Also tries webview SpeechSynthesis as secondary option.
 */
export class VoiceOutput extends EventEmitter {
  private webview: vscode.Webview | undefined;
  private lastText: string = '';
  private currentProcess: any = null;

  setWebview(webview: vscode.Webview): void {
    this.webview = webview;
  }

  /** Speak text aloud using system TTS (primary) + webview (fallback) */
  speak(text: string, priority: 'normal' | 'high' = 'normal'): void {
    if (!text) return;
    this.lastText = text;

    // Always cancel current speech to prevent overlapping voices
    this.cancel();

    // Primary: System TTS via PowerShell (Windows)
    this.speakViaSystem(text);

    // Secondary: Also send to webview for visual display
    this.webview?.postMessage({ type: 'speak', text, priority });
  }

  /** Cancel current speech */
  cancel(): void {
    // Kill running PowerShell TTS process and its children forcefully
    if (this.currentProcess) {
      try {
        spawn('taskkill', ['/pid', this.currentProcess.pid.toString(), '/t', '/f'], { windowsHide: true });
      } catch {}
      this.currentProcess = null;
    }
    // Also cancel webview speech
    this.webview?.postMessage({ type: 'cancelSpeech' });
  }

  /** Repeat the last spoken text */
  repeatLast(): void {
    if (this.lastText) {
      this.speak(this.lastText, 'high');
    }
  }

  /** Spell out the last spoken text character by character */
  spellOut(): void {
    if (this.lastText) {
      const spelled = this.lastText.split('').join(', ');
      this.speak(spelled, 'high');
    }
  }

  /** Set speech rate */
  setRate(rate: number): void {
    this.webview?.postMessage({ type: 'setSpeechRate', rate });
  }

  /**
   * Windows System TTS via PowerShell + System.Speech.
   * Zero dependencies, works offline, no webview needed.
   */
  private speakViaSystem(text: string): void {
    // Clean text for PowerShell
    const cleaned = text
      .replace(/'/g, "''")
      .replace(/"/g, '`"')
      .replace(/\n/g, ' ')
      .replace(/[^\x20-\x7E''`"]/g, ' ')
      .substring(0, 2000); // Limit length

    const rate = Math.round((BlindCodeConfig.speechRate - 1) * 5); // Convert 0.3-3.0 to -3 to 10

    const psScript = `
      Add-Type -AssemblyName System.Speech;
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      $synth.Rate = ${rate};
      $synth.Speak('${cleaned}');
      $synth.Dispose();
    `.trim();

    try {
      this.emit('start');
      this.currentProcess = spawn('powershell', ['-NoProfile', '-Command', psScript], {
        stdio: 'ignore',
        windowsHide: true,
      });
      this.currentProcess.on('exit', () => { 
        this.currentProcess = null; 
        this.emit('end');
      });
      this.currentProcess.on('error', (err: any) => {
        console.error('[BlindCode] System TTS failed:', err);
        this.currentProcess = null;
        this.emit('end');
      });
    } catch (err) {
      console.error('[BlindCode] Could not start system TTS:', err);
      this.emit('end');
    }
  }
}
