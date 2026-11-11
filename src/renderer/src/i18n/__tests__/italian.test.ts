import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import en from '@common/locales/en.json';
import italian from '@common/locales/it.json';

import { localizeRuntimeMessage } from '../runtime-messages';

vi.unmock('i18next');

const flatten = (value: Record<string, unknown>, prefix = '', entries: Record<string, string> = {}): Record<string, string> => {
  for (const [key, content] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (content && typeof content === 'object') {
      flatten(content as Record<string, unknown>, name, entries);
    } else {
      entries[name] = String(content);
    }
  }
  return entries;
};

describe('Italian interface catalog and runtime messages', () => {
  const instance = createInstance();
  beforeAll(async () => {
    await instance.init({
      lng: 'it',
      fallbackLng: 'en',
      resources: { it: { translation: italian }, en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  });

  it('covers every English key and preserves variables, markup, links and line breaks', () => {
    const source = flatten(en);
    const target = flatten(italian);
    expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort());
    for (const [key, value] of Object.entries(source)) {
      const translated = target[key];
      const extract = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).sort();
      expect(extract(translated, /\{\{[^{}]+\}\}|\$\{[^{}]+\}/g), key).toEqual(extract(value, /\{\{[^{}]+\}\}|\$\{[^{}]+\}/g));
      expect(extract(translated, /<\/?[A-Za-z][^>]*>/g), key).toEqual(extract(value, /<\/?[A-Za-z][^>]*>/g));
      expect(extract(translated, /https?:\/\/[^\s<>"')\]]+/g), key).toEqual(extract(value, /https?:\/\/[^\s<>"')\]]+/g));
      expect(translated.split('\n').length, key).toBe(value.split('\n').length);
      expect(translated.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('renders real Italian labels and interpolates the iteration warning without changing history', () => {
    expect(instance.t('common.save')).toBe('Salva');
    expect(instance.t('languages.it')).toBe('Italiano');
    const original =
      'The Agent has reached the maximum number of allowed iterations (60). To allow more iterations, go to Settings -> Agent -> Parameters and increase Max Iterations.';
    expect(localizeRuntimeMessage(original, instance.t)).toContain('(60)');
    expect(localizeRuntimeMessage(original, instance.t)).toContain('Impostazioni');
    expect(original).toContain('Settings');
    expect(localizeRuntimeMessage('Editing files...', instance.t)).toBe('Modifica dei file…');
  });

  it('preserves unknown diagnostics and uses the selected language for known statuses', async () => {
    const original = 'Vendor diagnostic: model-id/path.py HTTP 429';
    expect(localizeRuntimeMessage(original, instance.t)).toBe(original);
    expect(localizeRuntimeMessage('common.save', instance.t)).toBe('common.save');
    expect(localizeRuntimeMessage('common.save', instance.t, true)).toBe('Salva');
    for (const diagnostic of ['constructor', 'toString', '__proto__']) {
      expect(localizeRuntimeMessage(diagnostic, instance.t)).toBe(diagnostic);
    }
    await instance.changeLanguage('en');
    expect(localizeRuntimeMessage('Editing files...', instance.t)).toBe('Editing files...');
  });
});
