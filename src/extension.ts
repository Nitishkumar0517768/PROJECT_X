import * as vscode from 'vscode';
import * as path from 'path';
import { BlindCodeConfig } from './config';
import { SpatialAudioEngine } from './audio/spatialAudioEngine';
import { AudioMapper } from './audio/audioMapper';
import { VoiceInput } from './voice/voiceInput';
import { VoiceOutput } from './voice/voiceOutput';
import { SpeechCommandRegistry } from './voice/speechCommands';
import { GeminiClient } from './ai/geminiClient';
import { IntentParser } from './ai/intentParser';
import { ContextBuilder } from './ai/contextBuilder';
import { TrustProtocol } from './ai/trustProtocol';
import { SessionMemory } from './ai/sessionMemory';
import { CodeGPS } from './navigation/codeGPS';
import { LandmarkManager } from './navigation/landmarkManager';
import { SymbolNavigator } from './navigation/symbolNavigator';
import { ErrorNarrator } from './debug/errorNarrator';
import { CheckpointManager } from './checkpoint/checkpointManager';
import { WhisperClient } from './voice/whisperClient';
import { SystemSpeechListener } from './voice/systemSpeechListener';

/** The main webview view provider for BlindCode sidebar panel */
class BlindCodeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'blindcode.panel';
  private _view?: vscode.WebviewView;

  // Subsystem references
  private spatialAudio: SpatialAudioEngine;
  private audioMapper: AudioMapper;
  private voiceInput: VoiceInput;
  private voiceOutput: VoiceOutput;
  private commandRegistry: SpeechCommandRegistry;
  private aiClient: GeminiClient;
  private intentParser: IntentParser;
  private contextBuilder: ContextBuilder;
  private trustProtocol: TrustProtocol;
  private sessionMemory: SessionMemory;
  private codeGPS: CodeGPS;
  private landmarkManager: LandmarkManager;
  private symbolNavigator: SymbolNavigator;
  private errorNarrator: ErrorNarrator;
  private checkpointManager: CheckpointManager;
  private whisperClient: WhisperClient;
  private speechListener: SystemSpeechListener;

  constructor(private readonly _extensionUri: vscode.Uri) {
    // Initialize subsystems
    this.sessionMemory = new SessionMemory();
    this.aiClient = new GeminiClient();
    this.contextBuilder = new ContextBuilder(this.sessionMemory);
    this.audioMapper = new AudioMapper();
    this.spatialAudio = new SpatialAudioEngine();
    this.voiceInput = new VoiceInput();
    this.voiceOutput = new VoiceOutput();
    this.commandRegistry = new SpeechCommandRegistry();
    this.intentParser = new IntentParser(this.aiClient);
    this.checkpointManager = new CheckpointManager();
    this.trustProtocol = new TrustProtocol(this.checkpointManager);
    this.codeGPS = new CodeGPS();
    this.landmarkManager = new LandmarkManager();
    this.symbolNavigator = new SymbolNavigator();
    this.errorNarrator = new ErrorNarrator(this.aiClient, this.contextBuilder);
    this.whisperClient = new WhisperClient();
    this.speechListener = new SystemSpeechListener();
  }

  /**
   * Called when the webview view is resolved (sidebar panel opened).
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getWebviewContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this._handleWebviewMessage(message);
    });

    // Initialize subsystems with webview reference
    this.spatialAudio.setWebview(webviewView.webview);
    this.voiceInput.setWebview(webviewView.webview);
    this.voiceOutput.setWebview(webviewView.webview);
  }

  /** Send message to webview */
  public postMessage(message: any): void {
    this._view?.webview.postMessage(message);
  }

  /** Get the webview reference */
  public get webview(): vscode.Webview | undefined {
    return this._view?.webview;
  }
  // ─── System Speech Listener ─────────────────────────────────────────

  public startSystemListener(): void {
    this.speechListener.on('ready', () => {
      console.log('[BlindCode] System speech listener ready — microphone active.');
      this.voiceOutput.speak('BlindCode is listening. Just speak naturally.', 'high');
      this.postMessage({ type: 'showTranscript', text: '🎤 Microphone active — speak naturally' });
    });

    this.speechListener.on('hearing', () => {
      this.postMessage({ type: 'showTranscript', text: '🔴 Hearing you...' });
    });

    this.speechListener.on('transcript', async (text: string, confidence: number) => {
      console.log(`[BlindCode] Heard: "${text}" (${confidence}% confidence)`);
      this.postMessage({ type: 'showTranscript', text: `🗣️ "${text}"` });

      // Check for direct command first
      const command = this.commandRegistry.match(text);
      if (command) {
        switch (command) {
          case 'whereAmI': await this.handleWhereAmI(); break;
          case 'findBugs': await this.handleFindBugs(); break;
          case 'fixIt': await this.handleFixIt(); break;
          case 'confirm': await this.handleConfirm(); break;
          case 'reject': await this.handleReject(); break;
          case 'repeatLast': await this.handleRepeatLast(); break;
          case 'stopSpeaking': await this.handleStopSpeaking(); break;
          case 'slower': await this.handleSlower(); break;
          case 'faster': await this.handleFaster(); break;
          case 'spellItOut': await this.handleSpellItOut(); break;
          case 'dropLandmark': await this.handleDropLandmark(); break;
          case 'toggleAudio': await this.handleToggleAudio(); break;
          case 'createCheckpoint': await this.handleCreateCheckpoint(); break;
          case 'restoreCheckpoint': await this.handleRestoreCheckpoint(); break;
        }
        return;
      }

      // Fall through to AI intent processing
      await this._handleVoiceTranscript(text);
    });

    this.speechListener.on('audioData', async (base64: string) => {
      await this._handleAudioData(base64, 'audio/wav');
    });

    this.speechListener.on('error', (msg: string) => {
      console.error('[BlindCode] Speech listener error:', msg);
    });

    this.speechListener.start();
  }

  public stopSystemListener(): void {
    this.speechListener.stop();
  }

  // ─── Command Handlers ───────────────────────────────────────────────

  public async handlePushToTalk(): Promise<void> {
    this.voiceInput.toggle();
  }

  public async handleWhereAmI(): Promise<void> {
    const position = this.codeGPS.getCurrentPosition();
    if (position) {
      this.voiceOutput.speak(position, 'high');
      this.sessionMemory.addAction('query', 'Where am I?');
    }
  }

  public async handleFindBugs(): Promise<void> {
    this.voiceOutput.speak('Scanning for issues...', 'high');
    const narration = await this.errorNarrator.narrateErrors();
    if (narration) {
      this.voiceOutput.speak(narration, 'normal');
      this.sessionMemory.addAction('diagnose', 'Find bugs');
    } else {
      this.voiceOutput.speak('No issues found in the current file. Looking clean!', 'normal');
    }
  }

  public async handleFixIt(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.voiceOutput.speak('No file is open.', 'high');
      return;
    }

    this.voiceOutput.speak('Analyzing and preparing a fix...', 'high');
    const context = await this.contextBuilder.buildContext();
    const response = await this.aiClient.codeQuery(
      'Fix the most critical issue in the current code.',
      context
    );

    if (response) {
      this.trustProtocol.propose(response, editor);
      const proposal = this.trustProtocol.getPendingDescription();
      this.voiceOutput.speak(proposal, 'normal');
      this.sessionMemory.addAction('edit', 'Fix it');
    } else {
      this.voiceOutput.speak('I could not generate a fix. Try describing the issue.', 'normal');
    }
  }

  public async handleConfirm(): Promise<void> {
    const result = await this.trustProtocol.confirm();
    this.voiceOutput.speak(result, 'high');
    if (result.includes('applied') || result.includes('Done')) {
      this.sessionMemory.addAction('confirm', 'Applied change');
    }
  }

  public async handleReject(): Promise<void> {
    const result = this.trustProtocol.reject();
    this.voiceOutput.speak(result, 'high');
  }

  public async handleRepeatLast(): Promise<void> {
    this.voiceOutput.repeatLast();
  }

  public async handleStopSpeaking(): Promise<void> {
    this.voiceOutput.cancel();
  }

  public async handleSlower(): Promise<void> {
    const newRate = BlindCodeConfig.speechRate - 0.15;
    BlindCodeConfig.speechRate = newRate;
    this.voiceOutput.setRate(newRate);
    this.voiceOutput.speak(`Speech rate set to ${newRate.toFixed(1)}`, 'high');
  }

  public async handleFaster(): Promise<void> {
    const newRate = BlindCodeConfig.speechRate + 0.15;
    BlindCodeConfig.speechRate = newRate;
    this.voiceOutput.setRate(newRate);
    this.voiceOutput.speak(`Speech rate set to ${newRate.toFixed(1)}`, 'high');
  }

  public async handleSpellItOut(): Promise<void> {
    this.voiceOutput.spellOut();
  }

  public async handleDropLandmark(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Name this landmark',
      placeHolder: 'e.g. important part',
    });
    if (name) {
      this.landmarkManager.drop(name);
      this.voiceOutput.speak(`Landmark "${name}" dropped.`, 'high');
    }
  }

  public async handleGoToLandmark(): Promise<void> {
    const landmarks = this.landmarkManager.list();
    if (landmarks.length === 0) {
      this.voiceOutput.speak('No landmarks set yet.', 'high');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      landmarks.map(l => l.name),
      { placeHolder: 'Choose a landmark' }
    );
    if (picked) {
      await this.landmarkManager.goTo(picked);
      this.voiceOutput.speak(`Arrived at landmark "${picked}".`, 'high');
    }
  }

  public async handleToggleAudio(): Promise<void> {
    const enabled = this.spatialAudio.toggle();
    this.voiceOutput.speak(
      `Spatial audio ${enabled ? 'enabled' : 'disabled'}.`, 'high'
    );
  }

  public async handleCreateCheckpoint(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Name this checkpoint',
      placeHolder: 'e.g. before refactor',
    });
    if (name) {
      const result = await this.checkpointManager.create(name);
      this.voiceOutput.speak(result, 'high');
    }
  }

  public async handleRestoreCheckpoint(): Promise<void> {
    const checkpoints = await this.checkpointManager.list();
    if (checkpoints.length === 0) {
      this.voiceOutput.speak('No checkpoints available.', 'high');
      return;
    }
    const picked = await vscode.window.showQuickPick(checkpoints, {
      placeHolder: 'Choose checkpoint to restore',
    });
    if (picked) {
      const result = await this.checkpointManager.restore(picked);
      this.voiceOutput.speak(result, 'high');
    }
  }

  // ─── Voice Transcript Handler ───────────────────────────────────────

  private async _handleVoiceTranscript(transcript: string): Promise<void> {
    this.voiceOutput.speak('Processing...', 'high');
    this.sessionMemory.addAction('voice', transcript);

    // Parse intent
    const context = await this.contextBuilder.buildContext();
    const intent = await this.intentParser.parse(transcript, context);

    switch (intent.type) {
      case 'NAVIGATE':
        if (intent.target) {
          await this.symbolNavigator.navigateTo(intent.target);
          const pos = this.codeGPS.getCurrentPosition();
          this.voiceOutput.speak(pos || 'Navigation complete.', 'normal');
        }
        break;

      case 'DIAGNOSE':
        await this.handleFindBugs();
        break;

      case 'EDIT':
        await this.handleFixIt();
        break;

      case 'QUERY':
        const answer = await this.aiClient.codeQuery(transcript, context);
        if (answer) {
          this.voiceOutput.speak(answer, 'normal');
        }
        break;

      case 'UNDO':
        await this.handleRestoreCheckpoint();
        break;

      default:
        // Freeform AI query
        const response = await this.aiClient.codeQuery(transcript, context);
        if (response) {
          this.voiceOutput.speak(response, 'normal');
        } else {
          this.voiceOutput.speak('I didn\'t understand that. Could you try again?', 'normal');
        }
    }
  }

  // ─── Audio Data Handler (Groq Whisper STT) ──────────────────────────

  private async _handleAudioData(audioBase64: string, mimeType: string): Promise<void> {
    try {
      const transcript = await this.whisperClient.transcribe(audioBase64, mimeType);
      if (!transcript || transcript.length < 2) return;

      // Filter out noise/silence transcriptions
      const cleaned = transcript.toLowerCase().trim();
      const noisePatterns = ['you', 'thank you', 'thanks', 'bye', 'okay', 'hmm', 'um', 'uh', '...'];
      if (noisePatterns.includes(cleaned)) return;

      console.log('[BlindCode] Transcribed:', transcript);
      this.postMessage({ type: 'showTranscript', text: transcript });

      // Check if it's a direct command first
      const command = this.commandRegistry.match(transcript);
      if (command) {
        switch (command) {
          case 'whereAmI': await this.handleWhereAmI(); break;
          case 'findBugs': await this.handleFindBugs(); break;
          case 'fixIt': await this.handleFixIt(); break;
          case 'confirm': await this.handleConfirm(); break;
          case 'reject': await this.handleReject(); break;
          case 'repeatLast': await this.handleRepeatLast(); break;
          case 'stopSpeaking': await this.handleStopSpeaking(); break;
          case 'slower': await this.handleSlower(); break;
          case 'faster': await this.handleFaster(); break;
          case 'spellItOut': await this.handleSpellItOut(); break;
          case 'dropLandmark': await this.handleDropLandmark(); break;
          case 'toggleAudio': await this.handleToggleAudio(); break;
          case 'createCheckpoint': await this.handleCreateCheckpoint(); break;
          case 'restoreCheckpoint': await this.handleRestoreCheckpoint(); break;
          default: break;
        }
        return;
      }

      // Fall through to AI-based intent processing
      await this._handleVoiceTranscript(transcript);
    } catch (err) {
      console.error('[BlindCode] Audio transcription error:', err);
    }
  }

  // ─── Webview Message Handler ────────────────────────────────────────

  private async _handleWebviewMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'ready':
        // Webview is initialized — send initial config
        this.postMessage({
          type: 'configure',
          speechRate: BlindCodeConfig.speechRate,
          volume: BlindCodeConfig.audioVolume,
        });
        this.voiceOutput.speak('BlindCode is ready. Just start speaking. I am always listening.', 'normal');
        break;

      case 'transcript':
        await this._handleVoiceTranscript(message.text);
        break;

      case 'audioData':
        // Audio chunk from always-on mic — transcribe via Groq Whisper
        await this._handleAudioData(message.audio, message.mimeType);
        break;

      case 'listeningStarted':
        console.log('[BlindCode] Always-on listening started.');
        break;

      case 'speechEnd':
        break;

      case 'error':
        console.error('[BlindCode] Webview error:', message.message);
        this.voiceOutput.speak(message.message, 'high');
        break;
    }
  }

  // ─── Cursor Change Handler (Spatial Audio) ──────────────────────────

  public handleCursorChange(event: vscode.TextEditorSelectionChangeEvent): void {
    if (!BlindCodeConfig.spatialAudioEnabled) return;

    const editor = event.textEditor;
    const line = event.selections[0].active.line;
    const totalLines = editor.document.lineCount;
    const lineText = editor.document.lineAt(line).text;

    const audioParams = this.audioMapper.mapLine(lineText, line, totalLines, editor.document);
    this.spatialAudio.play(audioParams);
  }

  // ─── Webview HTML ───────────────────────────────────────────────────

  private _getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'blindcode-panel.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'blindcode-panel.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; media-src * blob:; connect-src *;">
  <link rel="stylesheet" href="${styleUri}">
  <title>BlindCode</title>
</head>
<body>
  <div id="blindcode-root">
    <div class="bc-header">
      <h2>🎧 BlindCode</h2>
      <span class="bc-status" id="status">Initializing...</span>
    </div>
    <div class="bc-section">
      <div class="bc-mic-indicator" id="mic-indicator">
        <span class="mic-icon">🎤</span>
        <span class="mic-label" id="mic-label">Starting microphone...</span>
      </div>
    </div>
    <div class="bc-section">
      <div class="bc-transcript" id="transcript"></div>
    </div>
    <div class="bc-section">
      <div class="bc-response" id="response"></div>
    </div>
    <div class="bc-shortcuts">
      <p><kbd>Alt+B</kbd> Push to Talk</p>
      <p><kbd>Alt+W</kbd> Where Am I?</p>
      <p><kbd>Alt+D</kbd> Find Bugs</p>
      <p><kbd>Alt+Y</kbd> Confirm</p>
      <p><kbd>Alt+N</kbd> Reject</p>
      <p><kbd>Alt+R</kbd> Repeat</p>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// ─── Extension Activation ──────────────────────────────────────────────

let viewProvider: BlindCodeViewProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('[BlindCode] Extension activating...');

  viewProvider = new BlindCodeViewProvider(context.extensionUri);

  // Register sidebar webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BlindCodeViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Register all commands
  const commands: Record<string, () => Promise<void>> = {
    'blindcode.pushToTalk': () => viewProvider.handlePushToTalk(),
    'blindcode.whereAmI': () => viewProvider.handleWhereAmI(),
    'blindcode.findBugs': () => viewProvider.handleFindBugs(),
    'blindcode.fixIt': () => viewProvider.handleFixIt(),
    'blindcode.confirm': () => viewProvider.handleConfirm(),
    'blindcode.reject': () => viewProvider.handleReject(),
    'blindcode.repeatLast': () => viewProvider.handleRepeatLast(),
    'blindcode.stopSpeaking': () => viewProvider.handleStopSpeaking(),
    'blindcode.slower': () => viewProvider.handleSlower(),
    'blindcode.faster': () => viewProvider.handleFaster(),
    'blindcode.spellItOut': () => viewProvider.handleSpellItOut(),
    'blindcode.dropLandmark': () => viewProvider.handleDropLandmark(),
    'blindcode.goToLandmark': () => viewProvider.handleGoToLandmark(),
    'blindcode.toggleAudio': () => viewProvider.handleToggleAudio(),
    'blindcode.createCheckpoint': () => viewProvider.handleCreateCheckpoint(),
    'blindcode.restoreCheckpoint': () => viewProvider.handleRestoreCheckpoint(),
  };

  for (const [id, handler] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }

  // Register cursor change listener for spatial audio
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      viewProvider.handleCursorChange(event);
    })
  );

  // Watch for config changes
  context.subscriptions.push(
    BlindCodeConfig.onDidChange(() => {
      viewProvider.postMessage({
        type: 'configure',
        speechRate: BlindCodeConfig.speechRate,
        volume: BlindCodeConfig.audioVolume,
      });
    })
  );

  // ─── AUTO-START: System Speech Listener (Windows mic, no webview) ───
  viewProvider.startSystemListener();

  console.log('[BlindCode] Extension activated successfully.');
}

export function deactivate() {
  // Stop the system speech listener
  if (viewProvider) {
    viewProvider.stopSystemListener();
  }
  console.log('[BlindCode] Extension deactivated.');
}

/** Generate a random nonce for CSP */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
