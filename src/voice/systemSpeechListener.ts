import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';

/**
 * System Speech Listener — uses Windows built-in System.Speech.Recognition
 * via PowerShell. No webview, no getUserMedia, no browser APIs.
 * Runs as a system process with direct microphone access.
 * 
 * Completely FREE, OFFLINE, zero dependencies.
 * 
 * The PowerShell script lives in scripts/speech_listener.ps1 as a standalone
 * file to avoid template literal escaping issues with esbuild bundling.
 */
export class SystemSpeechListener extends EventEmitter {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private extensionPath: string = '';

  /**
   * Set the extension root path so we can locate the scripts/ folder.
   */
  setExtensionPath(extPath: string): void {
    this.extensionPath = extPath;
  }

  /**
   * Start always-on speech recognition using Windows System.Speech.
   */
  start(): void {
    if (this.isRunning) return;

    // Locate the speech_listener.ps1 script shipped with the extension
    const scriptPath = path.join(this.extensionPath, 'scripts', 'speech_listener.ps1');

    try {
      this.process = spawn('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath
      ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.isRunning = true;
      let buffer = '';

      this.process.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          const trimmed = line.trim();
          if (trimmed.startsWith('READY')) {
            this.emit('ready');
          } else if (trimmed.startsWith('HEARING')) {
            this.emit('hearing');
          } else if (trimmed.startsWith('AUDIO:')) {
            const base64 = trimmed.substring(6);
            if (base64.length > 0) {
              this.emit('audioData', base64);
            }
          } else if (trimmed.startsWith('RECOGNIZED:')) {
            const parts = trimmed.replace('RECOGNIZED:', '').split(':');
            const confidence = parseInt(parts.pop() || '0', 10);
            const text = parts.join(':');
            if (text.length > 0) {
              this.emit('transcript', text, confidence);
            }
          } else if (trimmed.startsWith('ERROR:')) {
            this.emit('error', trimmed.replace('ERROR:', ''));
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error('[BlindCode] Speech listener stderr:', msg);
      });

      this.process.on('exit', (code) => {
        this.isRunning = false;
        this.process = null;
        console.log('[BlindCode] Speech listener exited with code:', code);
        this.emit('stopped');
      });

      this.process.on('error', (err) => {
        this.isRunning = false;
        console.error('[BlindCode] Speech listener error:', err);
        this.emit('error', err.message);
      });

    } catch (err: any) {
      console.error('[BlindCode] Failed to start speech listener:', err);
      this.emit('error', err.message);
    }
  }

  /**
   * Stop the speech recognition process.
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isRunning = false;
  }

  /**
   * Check if the listener is running.
   */
  get running(): boolean {
    return this.isRunning;
  }
}
