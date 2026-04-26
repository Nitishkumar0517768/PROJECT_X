# 🎧 BlindCode — Voice-First IDE for the Visually Impaired

> **The first VS Code extension built from the ground up for blind and visually impaired developers.**  
> Navigate code with spatial audio, talk to an AI co-pilot, and write software — completely hands-free.

![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?style=flat-square&logo=visual-studio-code)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## 🚀 What is BlindCode?

BlindCode transforms VS Code into a **voice-first, audio-driven development environment**. Instead of relying on a screen, BlindCode lets you:

- **🎤 Speak naturally** — Always-on microphone listens for commands and free-form speech
- **🔊 Hear your code** — Text-to-Speech reads out code context, errors, and AI responses  
- **🎵 Navigate with spatial audio** — Audio cues that change based on code structure and cursor position
- **🤖 AI co-pilot** — Conversational AI (powered by Google Gemini) that understands your code and intent
- **🛡️ Trust Protocol** — Every AI-suggested code change requires your explicit voice confirmation before applying

---

## 🏗️ Architecture Overview

```
blindcode/
├── src/
│   ├── extension.ts              # Main entry point & webview provider
│   ├── config.ts                 # Configuration wrapper (API keys, settings)
│   ├── ai/
│   │   ├── geminiClient.ts       # Google Gemini AI client
│   │   ├── intentParser.ts       # NLP intent classification
│   │   ├── contextBuilder.ts     # Code context extraction for AI
│   │   ├── trustProtocol.ts      # Safe code change approval system
│   │   └── sessionMemory.ts      # Conversation memory
│   ├── voice/
│   │   ├── systemSpeechListener.ts  # Windows System.Speech mic capture (PowerShell)
│   │   ├── whisperClient.ts      # Groq Whisper STT (cloud transcription)
│   │   ├── voiceInput.ts         # Webview-based voice input (fallback)
│   │   ├── voiceOutput.ts        # Windows SAPI Text-to-Speech
│   │   └── speechCommands.ts     # Voice command registry & matching
│   ├── audio/
│   │   ├── spatialAudioEngine.ts # Spatial audio playback
│   │   └── audioMapper.ts        # Maps code structure → audio parameters
│   ├── navigation/
│   │   ├── codeGPS.ts            # "Where am I?" position tracking
│   │   ├── landmarkManager.ts    # Bookmarkable code positions
│   │   └── symbolNavigator.ts    # Navigate to functions/classes by name
│   ├── debug/
│   │   └── errorNarrator.ts      # Reads out diagnostics/errors in plain English
│   └── checkpoint/
│       └── checkpointManager.ts  # Git-based code snapshots for safe undo
├── webview/
│   ├── blindcode-panel.js        # Sidebar panel UI logic
│   └── blindcode-panel.css       # Sidebar panel styles
├── esbuild.js                    # Build script
├── package.json                  # Extension manifest
└── tsconfig.json                 # TypeScript configuration
```

---

## 📋 Prerequisites

Before setting up BlindCode, ensure you have:

| Requirement | Version | Notes |
|---|---|---|
| **Windows** | 10 or 11 | Required — uses Windows SAPI for TTS and `System.Speech` for mic capture |
| **Node.js** | ≥ 18.x | [Download here](https://nodejs.org/) |
| **VS Code** | ≥ 1.85.0 | [Download here](https://code.visualstudio.com/) |
| **Git** | Any recent | [Download here](https://git-scm.com/) |
| **PowerShell** | 5.1+ (built-in) | Ships with Windows — used for mic access |
| **Microphone** | Any | Must be enabled in Windows Sound settings |

### API Keys (Free)

| Service | Purpose | Get Key |
|---|---|---|
| **Google Gemini** | AI co-pilot (code queries, intent parsing, fixes) | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **Groq** | Whisper STT (speech transcription) | [console.groq.com](https://console.groq.com/keys) |

> **Both APIs have generous free tiers** — no credit card required.

---

## 🛠️ Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/Nitishkumar0517768/PROJECT_X.git
cd PROJECT_X
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Extension

```bash
npm run compile
```

This runs `esbuild` to bundle the TypeScript source into `dist/extension.js` and copies webview assets.

### 4. Configure API Keys in VS Code

Open VS Code Settings (`Ctrl+,`) and search for **BlindCode**, then fill in:

| Setting | Value |
|---|---|
| `blindcode.geminiApiKey` | Your Google Gemini API key |
| `blindcode.groqApiKey` | Your Groq API key |

Or add them to your `settings.json`:

```json
{
  "blindcode.geminiApiKey": "YOUR_GEMINI_API_KEY",
  "blindcode.groqApiKey": "YOUR_GROQ_API_KEY"
}
```

### 5. Run in Development Mode

1. Open the `PROJECT_X` folder in VS Code
2. Press **`F5`** to launch the Extension Development Host
3. In the new window, click the **BlindCode** icon (👁 closed eye) in the activity bar
4. Wait for "BlindCode is ready. Just start speaking." announcement
5. **Start talking!**

### 6. Install as a Permanent Extension (Optional)

```bash
# Install vsce if you don't have it
npm install -g @vscode/vsce

# Package the extension
vsce package

# Install the .vsix file
code --install-extension blindcode-1.0.0.vsix
```

---

## 🎤 Voice Commands

BlindCode recognizes these voice commands automatically:

| Voice Command | Shortcut | Action |
|---|---|---|
| *"Where am I?"* | `Alt+W` | Reads current file, function, and line position |
| *"Find bugs"* | `Alt+D` | Scans for errors and reads them aloud |
| *"Fix it"* | — | AI generates a fix for the current issue |
| *"Confirm"* / *"Yes"* | `Alt+Y` | Applies the AI-suggested code change |
| *"Reject"* / *"No"* | `Alt+N` | Discards the proposed change |
| *"Repeat that"* | `Alt+R` | Replays the last spoken response |
| *"Stop talking"* | `Alt+S` | Cancels current speech output |
| *"Slower"* / *"Faster"* | — | Adjusts speech rate |
| *"Spell it out"* | — | Spells the last response character by character |
| *"Drop a landmark"* | `Alt+L` | Bookmarks the current position |
| *"Toggle audio"* | `Alt+A` | Enables/disables spatial audio |
| *"Create checkpoint"* | — | Saves a named code snapshot |
| *"Go back"* / *"Undo"* | — | Restores a previous checkpoint |

**Free-form speech** is also supported — just say anything naturally and the AI will understand your intent (e.g., *"explain this function"*, *"take me to the login handler"*, *"what does this project do?"*).

---

## ⚙️ Configuration Options

All settings are under `blindcode.*` in VS Code Settings:

| Setting | Type | Default | Description |
|---|---|---|---|
| `geminiApiKey` | string | `""` | Google Gemini API key |
| `groqApiKey` | string | `""` | Groq API key (for Whisper STT) |
| `speechRate` | number | `0.85` | TTS speed (0.3 = slow, 3.0 = fast) |
| `audioVolume` | number | `0.6` | Spatial audio volume (0.0–1.0) |
| `spatialAudioEnabled` | boolean | `true` | Enable spatial audio on cursor move |
| `primaryAiProvider` | string | `"gemini"` | AI provider: `"gemini"` or `"groq"` |

---

## 🔧 How It Works

### Voice Input Pipeline

```
Microphone → Windows System.Speech (PowerShell) → Voice Activity Detection
                    │
                    ├── Known command? → Execute directly (e.g., "Where am I?")
                    │
                    └── Free-form speech → Groq Whisper API → Transcription
                                                                    │
                                                              Intent Parser (Gemini)
                                                                    │
                                                              Execute Action
```

1. **System.Speech.Recognition** runs as a background PowerShell process with direct microphone access
2. Known commands (high confidence match) execute immediately — zero latency
3. Free-form speech audio is extracted, base64-encoded, and sent to **Groq Whisper** for accurate transcription
4. The transcription is parsed by **Google Gemini** to understand intent (navigate, diagnose, edit, query)
5. The appropriate action is executed and the result is spoken back via **Windows SAPI TTS**

### Trust Protocol

Every code modification follows a strict **propose → review → confirm** workflow:

1. AI proposes a change and **describes it in plain English**
2. You hear the description and say **"Confirm"** or **"Reject"**
3. Only confirmed changes are applied to your code
4. A checkpoint is automatically created before applying changes

---

## 🐛 Troubleshooting

### "Microphone not working" / No HEARING events

1. **Check Windows mic settings**: Settings → System → Sound → Input — ensure your microphone is selected and the volume slider is up
2. **Check app permissions**: Settings → Privacy → Microphone → ensure "Allow apps to access your microphone" is ON
3. **Test mic manually**: Open Windows Voice Recorder and try recording — if it doesn't work there, it's an OS-level issue
4. **Run the diagnostic**:
   ```bash
   powershell -ExecutionPolicy Bypass -File .\diagnose_mic.ps1
   ```

### "Extension says ready but nothing happens when I speak"

The PowerShell speech process may have crashed. Check the VS Code Developer Console (`Ctrl+Shift+I`) for `[BlindCode] Speech listener exited with code:` errors. Reload the window (`Ctrl+Shift+P` → "Reload Window").

### "AI responses are empty"

Ensure your API keys are configured correctly in VS Code Settings. Check that you have internet access for Gemini/Groq API calls.

---

## 📝 Development

### Build Commands

```bash
npm run compile    # One-time build
npm run watch      # Watch mode (auto-rebuild on save)
npm run lint       # Type-check without emitting
npm run package    # Create .vsix package
```

### Project Scripts

| Script | Command | Description |
|---|---|---|
| `compile` | `node esbuild.js` | Bundles TypeScript → `dist/extension.js` |
| `watch` | `node esbuild.js --watch` | Auto-rebuild on file changes |
| `package` | `vsce package` | Creates distributable `.vsix` file |
| `lint` | `tsc --noEmit` | Type-checks without producing output |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and test with `F5`
4. Commit: `git commit -m "Add my feature"`
5. Push: `git push origin feature/my-feature`
6. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👥 Team

Built with ❤️ for accessibility by the BlindCode team.

> *"Code is for everyone. Sight is optional."*
