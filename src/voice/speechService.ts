import * as vscode from 'vscode';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const API_KEY = '4124a27e33604e77aa7a9c93a5025bfb';

const ASSEMBLYAI_URL =
  `wss://streaming.assemblyai.com/v3/ws` +
  `?sample_rate=16000` +
  `&speech_model=universal-streaming-english` +
  `&format_text=false` +
  `&punctuate=false` +
  `&disfluencies=true`;

// Python script: writes raw PCM16 binary to stdout, metadata to stderr
const MIC_PYTHON = `
import sounddevice as sd
import numpy as np
import sys
import math

def get_best_device():
    devices = sd.query_devices()
    for i, d in enumerate(devices):
        if d['max_input_channels'] > 0:
            name = d['name'].lower()
            if 'microphone' in name or 'realtek' in name:
                return i
    return None

def callback(indata, frames, time, status):
    if status:
        sys.stderr.write(f"STATUS:{status}\\n")
        sys.stderr.flush()
    rms = math.sqrt(np.mean(indata**2))
    level = int(min(100, rms * 500))
    sys.stderr.write(f"LEVEL:{level}\\n")
    sys.stderr.flush()
    pcm16 = np.int16(np.clip(indata, -1.0, 1.0) * 32767)
    sys.stdout.buffer.write(pcm16.tobytes())
    sys.stdout.buffer.flush()

dev = get_best_device()
sys.stderr.write(f"DEVICE:{dev}\\n")
sys.stderr.flush()

try:
    with sd.InputStream(samplerate=16000, channels=1, dtype='float32',
                        blocksize=4096, callback=callback, device=dev):
        while True:
            sd.sleep(1000)
except Exception as e:
    sys.stderr.write(f"ERROR:{e}\\n")
    sys.stderr.flush()
    sys.exit(1)
`;

// Each PCM16 chunk: blocksize(4096) samples * 2 bytes = 8192 bytes per chunk
const CHUNK_SIZE = 8192;

export class SpeechService extends EventEmitter {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  public strictMode: boolean = true;
  private micProcess: ChildProcess | null = null;
  private currentDecoration: vscode.Range | null = null;
  private currentPartialText: string = '';

  start() {
    if (this.ws) this.stop();

    console.log('[BlindCode] Connecting to AssemblyAI...');

    this.ws = new WebSocket(ASSEMBLYAI_URL, {
      headers: { 'Authorization': API_KEY }
    });

    this.ws.on('open', () => {
      this.isConnected = true;
      console.log('[BlindCode] WS open — starting mic');
      this.emit('open');
      this.startMicProcess();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        const t = msg.type || '';
        console.log('[BlindCode]', t, msg.text || '');

        if (t === 'PartialTranscript' && msg.text) {
          this.emit('transcript', { text: msg.text, isFinal: false });
        } else if (t === 'FinalTranscript' && msg.text) {
          this.emit('transcript', { text: msg.text, isFinal: true });
          this._updateEditor(msg.text);
        } else if (t === 'Error') {
          fs.appendFileSync(path.join(os.tmpdir(), 'blindcode_debug.log'), `\n[ASSEMBLY ERROR] ${msg.error}`);
          this.emit('error', new Error(msg.error || 'AssemblyAI error'));
        }
      } catch (_) {}
    });

    this.ws.on('error', (err) => {
      fs.appendFileSync(path.join(os.tmpdir(), 'blindcode_debug.log'), `\n[WS ERROR] ${err.message}`);
      console.error('[BlindCode] WS error:', err.message);
      this.emit('error', err);
    });

    this.ws.on('close', (code) => {
      fs.appendFileSync(path.join(os.tmpdir(), 'blindcode_debug.log'), `\n[WS CLOSE] ${code}`);
      console.log('[BlindCode] WS closed:', code);
      this.isConnected = false;
      this.stopMicProcess();
      this.emit('close');
    });
  }

  stop() {
    this.stopMicProcess();
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.isConnected = false;
    this.currentDecoration = null;
    this.currentPartialText = '';
  }

  private startMicProcess() {
    if (this.micProcess) return;

    const tempFile = path.join(os.tmpdir(), 'blindcode_mic.py');
    fs.writeFileSync(tempFile, MIC_PYTHON);

    const trySpawn = (cmd: string) => {
      const proc = spawn(cmd, [tempFile]);
      proc.on('error', () => {
        if (cmd === 'python') trySpawn('python3');
        else this.emit('error', new Error('Python not found. Please install Python 3.'));
      });
      this.micProcess = proc;

      // stdout = raw binary PCM16 — split into 100ms chunks (3200 bytes) before sending
      // AssemblyAI requires 50-1000ms per message; Node may buffer multiple callbacks
      const CHUNK_BYTES = 3200; // 100ms @ 16kHz PCM16
      let audioBuffer = Buffer.alloc(0);

      proc.stdout?.on('data', (chunk: Buffer) => {
        audioBuffer = Buffer.concat([audioBuffer, chunk]);
        while (audioBuffer.length >= CHUNK_BYTES) {
          if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(audioBuffer.slice(0, CHUNK_BYTES));
          }
          audioBuffer = audioBuffer.slice(CHUNK_BYTES);
        }
      });

      // stderr = metadata (LEVEL, DEVICE, ERROR lines)
      let stderrBuf = '';
      proc.stderr?.on('data', (data: Buffer) => {
        stderrBuf += data.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (t.startsWith('LEVEL:')) {
            this.emit('level', parseInt(t.slice(6)) || 0);
          } else if (t.startsWith('DEVICE:')) {
            console.log('[BlindCode] Mic device index:', t.slice(7));
          } else if (t.startsWith('ERROR:')) {
            fs.appendFileSync(path.join(os.tmpdir(), 'blindcode_debug.log'), `\n[MIC ERROR] ${t.slice(6)}`);
            this.emit('error', new Error(t.slice(6)));
          } else if (t) {
            console.log('[BlindCode] Mic:', t);
          }
        }
      });

      proc.on('exit', (code) => {
        this.micProcess = null;
        if (code !== 0 && code !== null) {
          fs.appendFileSync(path.join(os.tmpdir(), 'blindcode_debug.log'), `\n[MIC EXIT] Exit code ${code}`);
          this.emit('error', new Error(`Mic crashed (exit ${code})`));
        }
      });
    };

    trySpawn('python');
  }

  private stopMicProcess() {
    if (this.micProcess) { this.micProcess.kill(); this.micProcess = null; }
  }

  private async _updateEditor(text: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const edit = new vscode.WorkspaceEdit();
    if (this.currentDecoration && this.currentPartialText.length > 0) {
      edit.replace(editor.document.uri, this.currentDecoration, text + ' ');
    } else {
      const pos = editor.selection.active;
      edit.insert(editor.document.uri, pos, text + ' ');
      this.currentDecoration = new vscode.Range(pos, pos);
    }
    await vscode.workspace.applyEdit(edit);

    if (this.currentDecoration) {
      const newEnd = editor.document.positionAt(
        editor.document.offsetAt(this.currentDecoration.start) + text.length + 1
      );
      this.currentDecoration = new vscode.Range(this.currentDecoration.start, newEnd);
    }
    this.currentPartialText = text;
    this.currentDecoration = null;
    this.currentPartialText = '';
  }
}
