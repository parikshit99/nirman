import { describe, expect, it } from 'vitest';
import { pickReplacementModel, readingModelOptions } from '../src/lib/gemini.ts';

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

describe('model list for Settings', () => {
  it('keeps Gemini models that can read bills, newest and Flash first, without image, speech or embedding models', () => {
    const m = (name: string, displayName = '', supportedActions = ['generateContent']) => ({ name: `models/${name}`, displayName, supportedActions });
    const options = readingModelOptions([
      m('gemini-2.5-pro', 'Gemini 2.5 Pro'),
      m('gemini-2.5-flash', 'Gemini 2.5 Flash'),
      m('gemini-3-flash-preview', 'Gemini 3 Flash Preview'),
      m('gemini-2.5-flash-lite'),
      m('gemini-flash-latest', 'Gemini Flash Latest'),
      m('gemini-2.5-flash-image'),
      m('gemini-2.5-flash-preview-tts'),
      m('gemini-embedding-001', '', ['embedContent']),
      m('gemma-3-27b-it'),
      m('gemini-2.5-flash'),
    ]);
    expect(options.map((o) => o.id)).toEqual(['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']);
    expect(options[2].label).toBe('Gemini 2.5 Flash');
    expect(options[3].label).toBe('gemini-2.5-flash-lite');
  });
});

