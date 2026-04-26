/**
 * Session Memory — maintains conversation context tied to code locations.
 * Persists within the VS Code session.
 */
export interface SessionAction {
  timestamp: number;
  type: string;
  description: string;
}

export interface Checkpoint {
  name: string;
  timestamp: number;
}

export class SessionMemory {
  private actions: SessionAction[] = [];
  private checkpoints: Checkpoint[] = [];
  private discussedFunctions: Set<string> = new Set();
  private resolvedErrors: string[] = [];

  /**
   * Record an action in session history.
   */
  addAction(type: string, description: string): void {
    this.actions.push({
      timestamp: Date.now(),
      type,
      description,
    });

    // Keep max 50 actions
    if (this.actions.length > 50) {
      this.actions = this.actions.slice(-50);
    }
  }

  /**
   * Get the N most recent actions as strings.
   */
  getRecentActions(n: number = 5): string[] {
    return this.actions
      .slice(-n)
      .map(a => `${a.type}: ${a.description}`);
  }

  /**
   * Record a checkpoint.
   */
  addCheckpoint(name: string): void {
    this.checkpoints.push({ name, timestamp: Date.now() });
  }

  /**
   * Get checkpoint names.
   */
  getCheckpointNames(): string[] {
    return this.checkpoints.map(c => c.name);
  }

  /**
   * Record a discussed function.
   */
  addDiscussedFunction(name: string): void {
    this.discussedFunctions.add(name);
  }

  /**
   * Record a resolved error.
   */
  addResolvedError(description: string): void {
    this.resolvedErrors.push(description);
  }

  /**
   * Get full memory context for AI injection.
   */
  toContextString(): string {
    const parts: string[] = [];
    if (this.actions.length > 0) {
      parts.push(`Recent actions: ${this.getRecentActions(5).join(', ')}`);
    }
    if (this.checkpoints.length > 0) {
      parts.push(`Checkpoints: ${this.getCheckpointNames().join(', ')}`);
    }
    if (this.discussedFunctions.size > 0) {
      parts.push(`Discussed: ${[...this.discussedFunctions].join(', ')}`);
    }
    return parts.join('\n');
  }
}
