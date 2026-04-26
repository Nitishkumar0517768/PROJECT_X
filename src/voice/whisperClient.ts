import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BlindCodeConfig } from '../config';

/**
 * Whisper Client — uses Groq's free Whisper API for speech-to-text.
 * No webview needed. Works from extension host directly.
 */
export class WhisperClient {
  private groqClient: any = null;

  private async getClient(): Promise<any> {
    if (this.groqClient) return this.groqClient;
    const apiKey = BlindCodeConfig.groqApiKey;
    if (!apiKey) return null;
    try {
      const Groq = (await import('groq-sdk')).default;
      this.groqClient = new Groq({ apiKey });
      return this.groqClient;
    } catch (err) {
      console.error('[BlindCode] Failed to init Groq for Whisper:', err);
      return null;
    }
  }

  /**
   * Transcribe audio (base64 encoded) to text via Groq Whisper.
   */
  async transcribe(audioBase64: string, mimeType: string = 'audio/webm'): Promise<string | null> {
    const client = await this.getClient();
    if (!client) return null;

    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('wav') ? 'wav' : 'ogg';
    const tmpFile = path.join(os.tmpdir(), `blindcode_${Date.now()}.${ext}`);

    try {
      const buffer = Buffer.from(audioBase64, 'base64');
      fs.writeFileSync(tmpFile, buffer);

      const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(tmpFile),
        model: 'whisper-large-v3',
        response_format: 'text',
      });

      const text = typeof transcription === 'string' ? transcription : transcription?.text;
      return text?.trim() || null;
    } catch (err) {
      console.error('[BlindCode] Whisper transcription failed:', err);
      return null;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }
}
