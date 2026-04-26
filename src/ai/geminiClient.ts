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
        model: 'gemini-2.0-flash',
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
    const prompt = `You are an intent classifier for a voice-controlled IDE. 
Given the code context below, classify the user's spoken transcript into ONE intent type.
Respond with ONLY a JSON object.

CONTEXT:
${context.substring(0, 2000)}

USER SPOKE: "${transcript}"

JSON FORMAT:
{
  "type": "NAVIGATE" | "DIAGNOSE" | "EDIT" | "QUERY" | "UNDO" | "UNKNOWN",
  "target": "optional target",
  "description": "brief description"
}

RULES:
- NAVIGATE: jump to, go to, find
- DIAGNOSE: find bugs, what's wrong, scan
- EDIT: fix it, change this, add
- QUERY: what is this, explain, where am i
- UNDO: go back, revert`;

    try {
      const model = await this.getGeminiModel();
      if (model) {
        const result = await model.generateContent(prompt);
        return result.response.text();
      }
    } catch (err) {
      console.warn('[BlindCode] Gemini intent parsing failed, trying Groq fallback:', (err as any)?.status || err);
    }

    // Fallback to Groq
    try {
      const result = await this.queryGroq(prompt);
      if (result) return result;
    } catch (err) {
      console.error('[BlindCode] Groq intent parsing also failed:', err);
    }

    return null;
  }

  /**
   * Request a code modification. The AI must return structured JSON.
   */
  async proposeCodeChange(instruction: string, context: string, code: string): Promise<{ speech: string; newCode: string } | null> {
    // Truncate code to prevent prompt overflow (keep first 6000 chars)
    const truncatedCode = code.length > 6000 ? code.substring(0, 6000) + '\n// ... (truncated)' : code;

    const prompt = `You are BlindCode — an AI co-pilot for a blind software developer.
The developer wants to modify their code.

CRITICAL RULES:
- The developer CANNOT see the screen at all
- Use spatial language
- Keep speech under 4 sentences
- You MUST respond with ONLY a valid JSON object, no markdown fences, no extra text

CONTEXT:
${context.substring(0, 500)}

CURRENT FILE CONTENT:
\`\`\`
${truncatedCode}
\`\`\`

USER REQUEST: "${instruction}"

Respond with ONLY this JSON object (no markdown, no backticks around it):
{
  "speech": "Brief description of what you fixed",
  "newCode": "the complete corrected file content"
}`;

    const parseResponse = (text: string) => {
      try {
        // Try to find JSON in the response
        // Remove markdown code fences if present
        let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.newCode && parsed.newCode.length > 10) {
            return {
              speech: parsed.speech || "I have prepared the change.",
              newCode: parsed.newCode
            };
          }
        }
      } catch (parseErr) {
        console.error('[BlindCode] JSON parse failed:', parseErr, 'Raw text:', text.substring(0, 200));
      }
      return null;
    };

    // Try Gemini first
    try {
      const model = await this.getGeminiModel();
      if (model) {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        console.log('[BlindCode] Gemini proposeCodeChange response length:', text.length);
        const parsed = parseResponse(text);
        if (parsed) return parsed;
      }
    } catch (err) {
      console.warn('[BlindCode] Gemini code change failed, trying Groq:', (err as any)?.status || err);
    }

    // Fallback to Groq (use large query for code)
    try {
      const text = await this.queryGroqLarge(prompt);
      if (text) {
        console.log('[BlindCode] Groq proposeCodeChange response length:', text.length);
        const parsed = parseResponse(text);
        if (parsed) return parsed;
      }
    } catch (err) {
      console.error('[BlindCode] Groq code change also failed:', err);
    }

    return null;
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
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 2048,
      });

      return completion.choices[0]?.message?.content || null;
    } catch (err) {
      console.error('[BlindCode] Groq query failed:', err);
      return null;
    }
  }

  /**
   * Large-output Groq query for code change operations (needs more tokens).
   */
  private async queryGroqLarge(prompt: string): Promise<string | null> {
    try {
      const client = await this.getGroqClient();
      if (!client) return null;

      const completion = await client.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are BlindCode, an AI co-pilot for a blind developer. You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.' },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        max_tokens: 8192,
      });

      return completion.choices[0]?.message?.content || null;
    } catch (err) {
      console.error('[BlindCode] Groq large query failed:', err);
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
