import { GeminiClient } from './geminiClient';

export interface Intent {
  type: 'NAVIGATE' | 'DIAGNOSE' | 'EDIT' | 'QUERY' | 'UNDO' | 'UNKNOWN';
  target?: string;
  description?: string;
}

/**
 * Intent Parser — classifies voice transcripts into structured commands.
 * Uses fast local regex matching first, falls back to AI for ambiguous input.
 */
export class IntentParser {
  constructor(private aiClient: GeminiClient) {}

  /**
   * Parse a voice transcript into a structured intent.
   */
  async parse(transcript: string, context: string): Promise<Intent> {
    // Try fast local matching first
    const localIntent = this.localMatch(transcript);
    if (localIntent) return localIntent;

    // Fall back to AI classification
    try {
      const result = await this.aiClient.parseIntent(transcript, context);
      if (result) {
        // Try to parse JSON from the AI response
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            type: parsed.type || 'UNKNOWN',
            target: parsed.target,
            description: parsed.description,
          };
        }
      }
    } catch (err) {
      console.error('[BlindCode] AI intent parsing failed:', err);
    }

    return { type: 'QUERY', description: transcript };
  }

  /**
   * Fast local regex-based intent matching for common commands.
   */
  private localMatch(transcript: string): Intent | null {
    const t = transcript.toLowerCase().trim();

    // NAVIGATE patterns
    if (/^(take me to|go to|jump to|navigate to|find)\s+(.+)/i.test(t)) {
      const match = t.match(/^(?:take me to|go to|jump to|navigate to|find)\s+(.+)/i);
      return { type: 'NAVIGATE', target: match?.[1] };
    }
    if (/^(go to line|line)\s+(\d+)/i.test(t)) {
      const match = t.match(/(\d+)/);
      return { type: 'NAVIGATE', target: `line:${match?.[1]}` };
    }

    // DIAGNOSE patterns
    if (/does anything look wrong|find bugs|what'?s wrong|what is wrong|any errors|what'?s broken|find issues|scan for/.test(t)) {
      return { type: 'DIAGNOSE' };
    }

    // EDIT patterns
    if (/^fix (it|this|the|that)|^add a|^make (this|it)|^change (this|the)|^remove (this|the)|^delete (this|the)/.test(t)) {
      return { type: 'EDIT', description: t };
    }

    // QUERY patterns
    if (/^where am i|^what does|^explain|^how does|^why does|^tell me about|^what is|^describe/.test(t)) {
      return { type: 'QUERY', description: t };
    }

    // UNDO patterns
    if (/^undo|^go back|^restore|^revert|^roll back|^undo everything/.test(t)) {
      const match = t.match(/(?:since|to)\s+(.+)/i);
      return { type: 'UNDO', target: match?.[1] };
    }

    return null;
  }
}
