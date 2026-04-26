/**
 * Speech Command Registry — maps spoken phrases to commands.
 * Used for fast local matching before falling back to AI.
 */
export class SpeechCommandRegistry {
  private commands: Map<string[], string> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // Navigation
    this.commands.set(['where am i', 'where am i?', 'my location', 'current position'], 'whereAmI');

    // Diagnosis
    this.commands.set(['find bugs', 'does anything look wrong', 'what\'s wrong', 'what is wrong', 'find errors', 'any issues', 'what\'s broken'], 'findBugs');

    // Fix
    this.commands.set(['fix it', 'fix this', 'repair it', 'fix the bug', 'fix the error'], 'fixIt');

    // Trust protocol
    this.commands.set(['confirm', 'yes', 'apply it', 'do it', 'go ahead', 'apply'], 'confirm');
    this.commands.set(['reject', 'no', 'don\'t do that', 'cancel', 'never mind', 'skip'], 'reject');

    // Speech control
    this.commands.set(['start listening', 'wake up', 'listen to me'], 'startListening');
    this.commands.set(['stop listening', 'go to sleep', 'ignore me', 'pause listening'], 'stopListening');
    this.commands.set(['repeat that', 'say again', 'what did you say', 'repeat'], 'repeatLast');
    this.commands.set(['stop talking', 'shut up', 'be quiet', 'stop', 'silence'], 'stopSpeaking');
    this.commands.set(['slower', 'slow down', 'speak slower'], 'slower');
    this.commands.set(['faster', 'speed up', 'speak faster'], 'faster');
    this.commands.set(['spell it out', 'spell it', 'character by character'], 'spellItOut');

    // Landmarks
    this.commands.set(['drop a landmark', 'mark this', 'bookmark this', 'save this spot'], 'dropLandmark');
    this.commands.set(['list landmarks', 'show landmarks', 'my landmarks'], 'listLandmarks');

    // Checkpoints
    this.commands.set(['create checkpoint', 'save checkpoint', 'checkpoint'], 'createCheckpoint');
    this.commands.set(['undo', 'go back', 'restore', 'undo everything'], 'restoreCheckpoint');

    // Audio
    this.commands.set(['toggle audio', 'mute audio', 'unmute audio', 'spatial audio'], 'toggleAudio');
  }

  /**
   * Try to match a transcript to a registered command.
   * Returns the command name or null if no match.
   */
  match(transcript: string): string | null {
    const normalized = transcript.toLowerCase().trim().replace(/[?.!,]/g, '');

    // Pass 1: exact phrase or substring match
    for (const [phrases, command] of this.commands.entries()) {
      for (const phrase of phrases) {
        if (normalized === phrase || normalized.includes(phrase)) {
          return command;
        }
      }
    }

    // Pass 2: keyword overlap — handles accent-garbled input
    // e.g. "if enough is enough" still matches "where am i" via shared words
    const transcriptWords = new Set(normalized.split(/\s+/));
    let bestCommand: string | null = null;
    let bestOverlap = 0;

    for (const [phrases, command] of this.commands.entries()) {
      for (const phrase of phrases) {
        const phraseWords = phrase.split(/\s+/);
        const overlap = phraseWords.filter(w => transcriptWords.has(w) && w.length > 2).length;
        const score = phraseWords.length > 0 ? overlap / phraseWords.length : 0;
        if (overlap >= 1 && score >= 0.5 && overlap > bestOverlap) {
          bestOverlap = overlap;
          bestCommand = command;
        }
      }
    }

    return bestCommand;
  }
}
