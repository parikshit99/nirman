import { describe, expect, it } from 'vitest';
import { pickReplacementModel } from '../src/lib/gemini.ts';

const gen = (name: string) => ({ name: `models/${name}`, supportedActions: ['generateContent', 'countTokens'] });

describe('pickReplacementModel', () => {
  it('prefers the flash "latest" alias', () => {
    expect(pickReplacementModel([gen('gemini-2.5-flash'), gen('gemini-flash-latest')])).toBe('gemini-flash-latest');
  });

  it('otherwise takes the newest stable Flash model', () => {
    const models = [
      gen('gemini-2.0-flash'),
      gen('gemini-2.5-flash'),
      gen('gemini-2.5-flash-lite'),
      gen('gemini-3-flash-preview'),
      gen('gemini-2.5-pro'),
      gen('gemini-2.5-flash-image'),
      { name: 'models/text-embedding-004', supportedActions: ['embedContent'] },
    ];
    expect(pickReplacementModel(models)).toBe('gemini-2.5-flash');
  });

  it('falls back to a preview only when nothing stable exists', () => {
    expect(pickReplacementModel([gen('gemini-3-flash-preview'), gen('gemini-2.5-pro')])).toBe('gemini-3-flash-preview');
    expect(pickReplacementModel([gen('gemini-2.5-pro')])).toBeNull();
  });
});
