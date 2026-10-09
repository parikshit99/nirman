import { describe, expect, it } from 'vitest';
import { ACCENTS, ACCENT_STEPS, ORANGE, accentShades, contrast, fromOklch, normalizeHex, textOn, toOklch } from '../src/index.ts';

// The cards' colour in each mode (`white` in apps/native/src/theme.ts).
const CARD = { light: '#ffffff', dark: '#16181c' };
const modes = ['light', 'dark'] as const;

describe('accent colours', () => {
  it("gives Nirman's orange back unchanged", () => {
    for (const mode of modes) expect(accentShades('#FF7A00', ORANGE[mode], CARD[mode])).toEqual(ORANGE[mode]);
  });

  it('reads colours and converts to OKLCH and back', () => {
    expect([normalizeHex('#ABC'), normalizeHex('1e88e5'), normalizeHex('#12345'), normalizeHex('red')]).toEqual(['#aabbcc', '#1e88e5', null, null]);
    for (const { hex } of ACCENTS) expect(fromOklch(toOklch(hex))).toBe(hex);
  });

  it('keeps every colour readable, in light and dark', () => {
    for (const { label, hex } of [...ACCENTS, { label: 'black', hex: '#000000' }, { label: 'white', hex: '#ffffff' }, { label: 'yellow', hex: '#ffff00' }]) {
      for (const mode of modes) {
        const s = accentShades(hex, ORANGE[mode], CARD[mode]);
        const where = `${label}, ${mode}`;
        for (const step of ACCENT_STEPS) expect(s[`orange${step}`], where).toMatch(/^#[0-9a-f]{6}$/);
        // Lines, icons and the picked tab on cards.
        expect(contrast(s.brandPrimary, CARD[mode]), where).toBeGreaterThanOrEqual(2.5);
        // Text in the accent colour (labels, badges) on cards and on its own pale background.
        expect(contrast(s.orange700, CARD[mode]), where).toBeGreaterThanOrEqual(4.5);
        expect(contrast(s.orange700, s.orange50), where).toBeGreaterThanOrEqual(4);
        // Text on a button or a picked chip.
        const text = textOn(s);
        for (const back of [s.brandPrimary, s.orange500]) expect(contrast(text, back), where).toBeGreaterThanOrEqual(2.5);
      }
    }
  });

  it('follows the chosen colour', () => {
    const blue = accentShades('#1e88e5', ORANGE.light, CARD.light);
    expect(blue.brandPrimary).toBe('#1e88e5');
    const hue = toOklch('#1e88e5').h;
    for (const step of ['100', '500', '700'] as const) expect(Math.abs(toOklch(blue[`orange${step}`]).h - hue)).toBeLessThan(15);
    // Light shades stay light and dark ones dark, in order.
    const lightness = ACCENT_STEPS.map((step) => toOklch(blue[`orange${step}`]).l);
    expect([...lightness].sort((a, b) => b - a)).toEqual(lightness);
    // Amber on white is too faint for a line or a tab, so it is darkened just enough.
    const amber = accentShades('#f9b81b', ORANGE.light, CARD.light).brandPrimary;
    expect(amber).not.toBe('#f9b81b');
    expect(contrast(amber, CARD.light)).toBeLessThan(3);
  });

  it('puts dark text on light colours and white text on dark ones', () => {
    expect(textOn(accentShades('#f9b81b', ORANGE.light, CARD.light))).toBe('#121212');
    expect(textOn(accentShades('#3f51b5', ORANGE.light, CARD.light))).toBe('#ffffff');
    expect(textOn(accentShades('#43a047', ORANGE.light, CARD.light))).toBe('#ffffff');
  });
});
