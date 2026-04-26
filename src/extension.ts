import * as vscode from 'vscode';
import * as path from 'path';
import { BlindCodeConfig } from './config';
import { SpatialAudioEngine } from './audio/spatialAudioEngine';
import { AudioMapper } from './audio/audioMapper';
import { VoiceInput } from './voice/voiceInput';
import { VoiceOutput } from './voice/voiceOutput';
import { SpeechCommandRegistry } from './voice/speechCommands';
import { GeminiClient } from './ai/geminiClient';
import { ContextBuilder } from './ai/contextBuilder';
import { TrustProtocol } from './ai/trustProtocol';
import { SessionMemory } from './ai/sessionMemory';
import { CodeGPS } from './navigation/codeGPS';
import { LandmarkManager } from './navigation/landmarkManager';
import { SymbolNavigator } from './navigation/symbolNavigator';
import { ErrorNarrator } from './debug/errorNarrator';
import { CheckpointManager } from './checkpoint/checkpointManager';
import { SpeechService } from './voice/speechService';

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
  private contextBuilder: ContextBuilder;
  private trustProtocol: TrustProtocol;
  private sessionMemory: SessionMemory;
  private codeGPS: CodeGPS;
  private landmarkManager: LandmarkManager;
  private symbolNavigator: SymbolNavigator;
  private errorNarrator: ErrorNarrator;
  private checkpointManager: CheckpointManager;
  private speechService: SpeechService;
  
  private isListenerReady: boolean = false;
  private isProcessingVoice: boolean = false;
  private isAsleep: boolean = false;
  private isSpeaking: boolean = false;

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
    this.checkpointManager = new CheckpointManager();
    this.trustProtocol = new TrustProtocol(this.checkpointManager);
    this.speechService = new SpeechService();

    // Track sleep state only (removed isSpeaking gate — it blocked transcripts)
    this.voiceOutput.on('start', () => { /* TTS started */ });
    this.voiceOutput.on('end', () => { /* TTS ended */ });
    this.codeGPS = new CodeGPS();
    this.landmarkManager = new LandmarkManager();
    this.symbolNavigator = new SymbolNavigator();
    this.errorNarrator = new ErrorNarrator(this.aiClient, this.contextBuilder);
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
  // ─── System Speech Listener (AssemblyAI Real-Time) ───────────────────

  public startSystemListener(): void {
    this.speechService.on('open', () => {
      console.log('[BlindCode] AssemblyAI speech listener ready — microphone active.');
      this.isListenerReady = true;
      this.postMessage({ type: 'micReady' });
      console.log('[BlindCode] Mic ready — listening for commands.');
    });

    this.speechService.on('transcript', (msg: { text: string, isFinal: boolean }) => {
      if (this.isAsleep) return;

      // Show live transcript in sidebar
      this.postMessage({ type: 'showTranscript', text: `🗣️ ${msg.text}` });

      if (msg.isFinal && msg.text.trim()) {
        const command = this.commandRegistry.match(msg.text);
        if (command) {
          console.log('[BlindCode] Voice command:', command);
          this.dispatchCommand(command, msg.text);
        }
      }
    });

    this.speechService.on('level', (level: number) => {
      this.postMessage({ type: 'micLevel', level });
    });

    this.speechService.on('error', (err: Error) => {
      console.error('[BlindCode] Speech service error:', err);
      this.voiceOutput.speak('Microphone error: ' + err.message, 'high');
      this.postMessage({ type: 'showTranscript', text: '❌ Error: ' + err.message });
    });

    this.speechService.start();
  }

  public stopSystemListener(): void {
    this.speechService.stop();
  }

  /** Route a matched command name to its handler */
  private dispatchCommand(command: string, rawText: string): void {
    const dispatch: Record<string, () => void> = {
      'whereAmI':          () => this.handleWhereAmI(),
      'findBugs':          () => this.handleFindBugs(),
      'fixIt':             () => this.handleFixIt(rawText),
      'confirm':           () => this.handleConfirm(),
      'reject':            () => this.handleReject(),
      'startListening':    () => { this.isAsleep = false; this.voiceOutput.speak('Listening.', 'high'); },
      'stopListening':     () => { this.isAsleep = true; this.voiceOutput.speak('Going to sleep.', 'high'); },
      'repeatLast':        () => this.handleRepeatLast(),
      'stopSpeaking':      () => this.handleStopSpeaking(),
      'slower':            () => this.handleSlower(),
      'faster':            () => this.handleFaster(),
      'spellItOut':        () => this.handleSpellItOut(),
      'dropLandmark':      () => this.handleDropLandmark(),
      'goToLandmark':      () => this.handleGoToLandmark(),
      'toggleAudio':       () => this.handleToggleAudio(),
      'createCheckpoint':  () => this.handleCreateCheckpoint(),
      'restoreCheckpoint': () => this.handleRestoreCheckpoint(),
    };
    const handler = dispatch[command];
    if (handler) {
      handler();
    } else {
      console.warn('[BlindCode] No handler for command:', command);
    }
  }

  // ─── Command Handlers ───────────────────────────────────────────────

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
      this.voiceOutput.speak(narration + '. Preparing a fix now...', 'normal');
      this.sessionMemory.addAction('diagnose', 'Find bugs');
      await this.handleFixIt('Fix all issues found: ' + narration);
    } else {
      this.voiceOutput.speak('No issues found in the current file. Looking clean!', 'normal');
    }
  }

  public async handleFixIt(instruction?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.voiceOutput.speak('No file is open.', 'high');
      return;
    }

    this.voiceOutput.speak('Analyzing and preparing a fix...', 'high');
    const context = await this.contextBuilder.buildContext();
    const code = editor.document.getText();
    
    const response = await this.aiClient.proposeCodeChange(
      instruction || 'Fix the most critical issue in the current code.',
      context,
      code
    );

    if (response) {
      this.trustProtocol.propose(response.speech, editor, response.newCode);
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
        
        // If the speech listener was already ready before the panel opened,
        // send micReady now so the UI updates correctly
        if (this.isListenerReady) {
          this.postMessage({ type: 'micReady' });
          this.postMessage({ type: 'showTranscript', text: '🎤 Microphone active — speak naturally' });
        }
        
        this.voiceOutput.speak('BlindCode is ready. Just start speaking. I am always listening.', 'normal');
        break;

      case 'audioStreamChunk':
        // Pipe continuous PCM stream to AssemblyAI
        if (!this.isAsleep && !this.isSpeaking) {
          this.speechService.sendAudio(message.data);
        }
        break;

      case 'listeningStarted':
        console.log('[BlindCode] Always-on listening started.');
        break;

      case 'error':
        console.error('[BlindCode] Webview error:', message.message);
        this.voiceOutput.speak(message.message, 'high');
        break;

      case 'buttonCommand':
        // Button clicks are treated exactly like voice commands
        console.log(`[BlindCode] Button command: "${message.command}"`);
        await this._handleButtonCommand(message.command);
    }
  }

  // ─── Button Command Handler ─────────────────────────────────────────

  private async _handleButtonCommand(commandText: string): Promise<void> {
    const command = this.commandRegistry.match(commandText);

    // Wake word
    if (command === 'startListening') {
      this.isAsleep = false;
      this.voiceOutput.speak('I am awake and listening.', 'high');
      return;
    }

    if (command) {
      switch (command) {
        case 'stopListening':
          this.isAsleep = true;
          this.voiceOutput.speak('Going to sleep. Say wake up to resume.', 'high');
          break;
        case 'stopSpeaking': await this.handleStopSpeaking(); break;
        case 'confirm': await this.handleConfirm(); break;
        case 'reject': await this.handleReject(); break;
        case 'repeatLast': await this.handleRepeatLast(); break;
        case 'whereAmI': await this.handleWhereAmI(); break;
        case 'findBugs': await this.handleFindBugs(); break;
        case 'fixIt': await this.handleFixIt(); break;
        case 'slower': await this.handleSlower(); break;
        case 'faster': await this.handleFaster(); break;
        case 'spellItOut': await this.handleSpellItOut(); break;
        case 'dropLandmark': await this.handleDropLandmark(); break;
        case 'toggleAudio': await this.handleToggleAudio(); break;
        case 'createCheckpoint': await this.handleCreateCheckpoint(); break;
        case 'restoreCheckpoint': await this.handleRestoreCheckpoint(); break;
      }
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
        <div class="mic-status-row">
          <span class="mic-icon">🎤</span>
          <span class="mic-label" id="mic-label">Starting microphone...</span>
        </div>
        <div class="volume-bar-container">
          <div id="volume-bar" class="volume-bar"></div>
        </div>
      </div>
      <canvas id="visualizer" width="300" height="60" style="display:none; width:100%; margin-top:10px; border-radius:4px; background:#1e1e1e;"></canvas>
    </div>
    <div class="bc-section">
      <div class="bc-transcript" id="transcript">Waiting for speech...</div>
    </div>
    <div class="bc-section">
      <div class="bc-response" id="response"></div>
    </div>
    <div class="bc-commands-guide">
      <div class="bc-guide-title">🎙️ Quick Commands</div>
      <div class="bc-btn-grid">
        <button class="bc-cmd-btn bc-btn-green" data-cmd="start listening">🟢 Wake Up</button>
        <button class="bc-cmd-btn bc-btn-red" data-cmd="go to sleep">🔴 Sleep</button>
        <button class="bc-cmd-btn" data-cmd="where am I">📍 Where Am I</button>
        <button class="bc-cmd-btn" data-cmd="find bugs">🐛 Find Bugs</button>
        <button class="bc-cmd-btn" data-cmd="fix it">🔧 Fix It</button>
        <button class="bc-cmd-btn bc-btn-green" data-cmd="confirm">✅ Confirm</button>
        <button class="bc-cmd-btn bc-btn-red" data-cmd="reject">❌ Reject</button>
        <button class="bc-cmd-btn" data-cmd="stop talking">🤫 Stop Talking</button>
        <button class="bc-cmd-btn" data-cmd="repeat">🔁 Repeat</button>
        <button class="bc-cmd-btn" data-cmd="undo">↩️ Undo</button>
        <button class="bc-cmd-btn" data-cmd="create checkpoint">💾 Checkpoint</button>
        <button class="bc-cmd-btn" data-cmd="explain this">💡 Explain</button>
      </div>
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
