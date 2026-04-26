import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * System Speech Listener — uses Windows built-in System.Speech.Recognition
 * via PowerShell. No webview, no getUserMedia, no browser APIs.
 * Runs as a system process with direct microphone access.
 * 
 * Completely FREE, OFFLINE, zero dependencies.
 */
export class SystemSpeechListener extends EventEmitter {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;

  /**
   * Start always-on speech recognition using Windows System.Speech.
   */
  start(): void {
    if (this.isRunning) return;

    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech

$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$recognizer.SetInputToDefaultAudioDevice()

# Load specific command grammar for better accuracy
$commands = New-Object System.Speech.Recognition.Choices
$commands.Add(@(
    "where am I",
    "find bugs",
    "what is wrong",
    "fix it",
    "fix this",
    "confirm",
    "yes",
    "apply it",
    "reject",
    "no",
    "cancel",
    "repeat that",
    "say again",
    "stop talking",
    "stop",
    "slower",
    "faster",
    "spell it out",
    "drop a landmark",
    "drop landmark",
    "list landmarks",
    "toggle audio",
    "create checkpoint",
    "save checkpoint",
    "undo",
    "go back",
    "restore",
    "take me to",
    "go to",
    "what does this do",
    "explain this",
    "tell me about this project"
))
$commandGrammar = New-Object System.Speech.Recognition.GrammarBuilder($commands)
$grammar = New-Object System.Speech.Recognition.Grammar($commandGrammar)
$grammar.Name = "commands"
$recognizer.LoadGrammar($grammar)

# Also load dictation grammar for free-form speech
$dictation = New-Object System.Speech.Recognition.DictationGrammar
$dictation.Name = "dictation"
$recognizer.LoadGrammar($dictation)

# Use Register-ObjectEvent so output reaches stdout properly
Register-ObjectEvent -InputObject $recognizer -EventName SpeechDetected -Action {
    Write-Host "HEARING"
} | Out-Null

Register-ObjectEvent -InputObject $recognizer -EventName SpeechRecognized -Action {
    $r = $EventArgs.Result
    if ($r.Grammar.Name -eq "commands" -and $r.Confidence -gt 0.85) {
        $conf = [math]::Round($r.Confidence * 100)
        Write-Host "RECOGNIZED:$($r.Text):$conf"
    } elseif ($r.Audio) {
        $memStream = New-Object System.IO.MemoryStream
        $r.Audio.WriteToWaveStream($memStream)
        $bytes = $memStream.ToArray()
        $base64 = [Convert]::ToBase64String($bytes)
        Write-Host "AUDIO:$base64"
    }
} | Out-Null

Register-ObjectEvent -InputObject $recognizer -EventName SpeechRecognitionRejected -Action {
    $r = $EventArgs.Result
    if ($r -and $r.Audio) {
        $memStream = New-Object System.IO.MemoryStream
        $r.Audio.WriteToWaveStream($memStream)
        $bytes = $memStream.ToArray()
        $base64 = [Convert]::ToBase64String($bytes)
        Write-Host "AUDIO:$base64"
    }
} | Out-Null

Write-Host "READY"

try {
    $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
    while ($true) { Start-Sleep -Milliseconds 200 }
} catch {
    Write-Host "ERROR:$($_.Exception.Message)"
}
`;

    try {
      const tmpDir = os.tmpdir();
      const scriptPath = path.join(tmpDir, 'blindcode_speech.ps1');
      fs.writeFileSync(scriptPath, psScript, 'utf8');

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
