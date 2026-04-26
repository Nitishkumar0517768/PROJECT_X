import { BlindCodeConfig } from '../config';

/**
 * AI Client — connects to Gemini (primary) and Groq (fallback).
 * Handles all AI queries with the BlindCode system prompt.
 */
export class GeminiClient {
  private geminiModel: any = null;
  private groqClient: any = null;

  private readonly SYSTEM_PROMPT = `You are BlindCode — an AI co-pilot for a blind software developer.

CRITICAL RULES:
- The developer CANNOT see the screen at all
- Never use visual language: "as you can see", "look at", "you'll notice"
- Always use spatial language: "inside", "above", "below", "before", "after"
- Keep all responses under 4 sentences — developer hears every word in real time
- End every suggestion with your confidence as: CONFIDENCE:XX (0-100)
- Never apply changes — always propose and wait for confirmation
- When reading code changes aloud, be precise: say variable names, types, syntax
- Be concise but thorough. Every word matters when it's spoken aloud.`;

  /**
   * Initialize the Gemini client lazily on first use.
   */
  private async getGeminiModel(): Promise<any> {
    if (this.geminiModel) return this.geminiModel;

    const apiKey = BlindCodeConfig.geminiApiKey;
    if (!apiKey) return null;

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      this.geminiModel = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: this.SYSTEM_PROMPT,
      });
      return this.geminiModel;
    } catch (err) {
      console.error('[BlindCode] Failed to init Gemini:', err);
      return null;
    }
  }

  /**
   * Initialize the Groq client lazily.
   */
  private async getGroqClient(): Promise<any> {
    if (this.groqClient) return this.groqClient;

    const apiKey = BlindCodeConfig.groqApiKey;
    if (!apiKey) return null;

    try {
      const Groq = (await import('groq-sdk')).default;
      this.groqClient = new Groq({ apiKey });
      return this.groqClient;
    } catch (err) {
      console.error('[BlindCode] Failed to init Groq:', err);
      return null;
    }
  }

  /**
   * Send a code query to the AI with project context.
   * Tries Gemini first, falls back to Groq.
   */
  async codeQuery(userMessage: string, context: string): Promise<string | null> {
    const fullPrompt = `${context}\n\nDeveloper says: "${userMessage}"`;

    // Try primary provider
    const provider = BlindCodeConfig.primaryAiProvider;
    if (provider === 'gemini') {
      const result = await this.queryGemini(fullPrompt);
      if (result) return this.processResponse(result);
      // Fallback to Groq
      const fallback = await this.queryGroq(fullPrompt);
      if (fallback) return this.processResponse(fallback);
    } else {
      const result = await this.queryGroq(fullPrompt);
      if (result) return this.processResponse(result);
      // Fallback to Gemini
      const fallback = await this.queryGemini(fullPrompt);
      if (fallback) return this.processResponse(fallback);
    }

    return null;
  }

  /**
   * Parse intent from a transcript using AI.
   */
  async parseIntent(transcript: string, context: string): Promise<string | null> {
    const prompt = `${context}

The blind developer just said: "${transcript}"

Classify this into ONE intent type. Respond with ONLY a JSON object:
{
  "type": "NAVIGATE" | "DIAGNOSE" | "EDIT" | "QUERY" | "UNDO",
  "target": "optional target name or description",
  "description": "brief description of what they want"
}

If it's a navigation request (go to, take me to, find, jump to), use NAVIGATE.
If it's about bugs/errors/issues (find bugs, what's wrong, anything broken), use DIAGNOSE.
If it's about fixing/changing/adding code (fix it, add, change, make), use EDIT.
If it's a question (what does, explain, how, why, tell me about), use QUERY.
If it's about undoing/reverting (undo, go back, restore, revert), use UNDO.`;

    const result = await this.codeQuery(prompt, '');
    return result;
  }

  private async queryGemini(prompt: string): Promise<string | null> {
    try {
      const model = await this.getGeminiModel();
      if (!model) return null;

      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text();
    } catch (err) {
      console.error('[BlindCode] Gemini query failed:', err);
      return null;
    }
  }

  private async queryGroq(prompt: string): Promise<string | null> {
    try {
      const client = await this.getGroqClient();
      if (!client) return null;

      const completion = await client.chat.completions.create({
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 500,
      });

      return completion.choices[0]?.message?.content || null;
    } catch (err) {
      console.error('[BlindCode] Groq query failed:', err);
      return null;
    }
  }

  /**
   * Post-process AI response: extract confidence score, clean up.
   */
  private processResponse(raw: string): string {
    // Extract CONFIDENCE:XX tag if present
    const confidenceMatch = raw.match(/CONFIDENCE:\s*(\d+)/i);
    let confidence = -1;
    let cleanText = raw;

    if (confidenceMatch) {
      confidence = parseInt(confidenceMatch[1], 10);
      cleanText = raw.replace(/CONFIDENCE:\s*\d+/gi, '').trim();
    }

    // Prepend confidence if found
    if (confidence >= 0) {
      if (confidence >= 90) {
        cleanText = `I'm ${confidence}% confident. ${cleanText}`;
      } else if (confidence >= 60) {
        cleanText = `I'm about ${confidence}% sure. ${cleanText}`;
      } else {
        cleanText = `I'm only ${confidence}% confident — take this with caution. ${cleanText}`;
      }
    }

    return cleanText;
  }
}
