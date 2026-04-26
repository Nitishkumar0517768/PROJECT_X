import * as vscode from 'vscode';
import { AudioParams } from './spatialAudioEngine';
import { BlindCodeConfig } from '../config';

/**
 * Maps code characteristics to spatial audio parameters.
 * Uses simple bracket counting for nesting depth (no tree-sitter dependency).
 */
export class AudioMapper {
  // Pitch mapping: nesting depth → frequency (Hz)
  private readonly DEPTH_FREQ: Record<number, number> = {
    0: 150,  // global scope — deep tone
    1: 220,  // function level — mid tone
    2: 330,  // if/loop — higher
    3: 440,  // nested block — high
    4: 550,  // deep nesting — warning
  };

  /**
   * Compute audio parameters for a given code line.
   */
  mapLine(
    lineText: string,
    lineNumber: number,
    totalLines: number,
    document: vscode.TextDocument
  ): AudioParams {
    const depth = this.getNestingDepth(document, lineNumber);
    const lineType = this.getLineType(lineText);
    const frequency = this.depthToFrequency(depth);
    const stereo = this.lineToStereo(lineNumber, totalLines);
    const texture = this.lineTypeToTexture(lineType);
    const duration = this.textureDuration(texture);

    return {
      frequency,
      stereo,
      duration,
      texture,
      volume: BlindCodeConfig.audioVolume,
    };
  }

  /**
   * Calculate nesting depth at a given line by counting unmatched brackets above.
   */
  private getNestingDepth(document: vscode.TextDocument, line: number): number {
    let depth = 0;
    for (let i = 0; i <= line; i++) {
      const text = document.lineAt(i).text;
      for (const ch of text) {
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      }
    }
    // Subtract brackets on the current line that are closers
    const currentText = document.lineAt(line).text;
    for (const ch of currentText) {
      if (ch === '}' || ch === ')' || ch === ']') {
        // The depth was already adjusted; this gives the "inside" depth
      }
    }
    return depth;
  }

  /**
   * Map nesting depth to frequency.
   */
  private depthToFrequency(depth: number): number {
    if (depth >= 4) return this.DEPTH_FREQ[4]!;
    return this.DEPTH_FREQ[depth] ?? this.DEPTH_FREQ[0]!;
  }

  /**
   * Map line position to stereo pan (-1.0 to 1.0).
   */
  private lineToStereo(line: number, totalLines: number): number {
    if (totalLines <= 1) return 0;
    return (line / (totalLines - 1)) * 2 - 1;
  }

  /**
   * Detect line type from its content.
   */
  private getLineType(lineText: string): string {
    const trimmed = lineText.trim();
    if (!trimmed) return 'empty';
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return 'comment';
    if (/^(import |from |require\(|#include)/.test(trimmed)) return 'import';
    if (/^(function |def |fn |func |public |private |protected |static |async function)/.test(trimmed) || /=>\s*\{/.test(trimmed)) return 'function';
    if (/^(class |interface |struct |enum )/.test(trimmed)) return 'class';
    return 'normal';
  }

  private lineTypeToTexture(lineType: string): string {
    const map: Record<string, string> = {
      'comment': 'comment',
      'import': 'import',
      'function': 'function',
      'class': 'class',
      'empty': 'move',
      'normal': 'normal',
    };
    return map[lineType] || 'normal';
  }

  private textureDuration(texture: string): number {
    const durations: Record<string, number> = {
      'normal': 0.12,
      'comment': 0.08,
      'import': 0.1,
      'function': 0.05,
      'class': 0.25,
      'error': 0.5,
      'warning': 0.3,
      'move': 0.03,
      'eof': 0.6,
      'whoosh': 0.3,
    };
    return durations[texture] || 0.12;
  }
}
