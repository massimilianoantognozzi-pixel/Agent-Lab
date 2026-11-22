import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isImageProviderProfile } from '@common/agent';

import { ImageGenerationSettings } from '../ImageGenerationSettings';

import type { ProviderProfile, SettingsData } from '@common/types';

vi.mock('react-i18next', async () => {
  const { default: locale } = await import('@common/locales/it.json');
  return {
    useTranslation: () => ({
      t: (key: string) =>
        key.split('.').reduce<unknown>((value, part) => (value && typeof value === 'object' ? Reflect.get(value, part) : undefined), locale) ?? key,
    }),
  };
});

const oldSettings = { language: 'it', preferredModels: ['coding-profile/coding-model'] } as SettingsData;
const official = (id: string, name: string): ProviderProfile => ({
  id,
  name,
  provider: { name: 'openai', apiKey: 'synthetic-key-must-not-appear', useWebSearch: false },
});
const profile = official('illustrations', 'Illustrazioni');
const alternative = official('design', 'Design');
const legacySelection: NonNullable<SettingsData['imageGeneration']> = {
  providerId: profile.id,
  model: 'gpt-image-2.6-flare',
  quality: 'max',
  size: '1024x1536',
};

const setup = (settings: SettingsData, providers: ProviderProfile[]) => {
  const saved = vi.fn<(s: SettingsData) => void>();
  const Harness = () => {
    const [current, setCurrent] = useState(settings);
    return (
      <ImageGenerationSettings
        settings={current}
        providers={providers}
        setSettings={(s) => {
          saved(s);
          setCurrent(s);
        }}
      />
    );
  };
  render(<Harness />);
  return saved;
};

const choose = (current: string, next: string) => {
  fireEvent.click(screen.getByRole('button', { name: current }));
  fireEvent.click(screen.getByRole('option', { name: next }));
};

describe('impostazioni immagini', () => {
  it('accepts the official endpoint and rejects endpoint or header overrides before selection', () => {
    const withOptions = (extra: Record<string, unknown>): ProviderProfile => ({ ...profile, provider: { ...profile.provider, ...extra } });
    expect(isImageProviderProfile(withOptions({ baseURL: 'https://api.openai.com/v1/' }))).toBe(true);
    expect(isImageProviderProfile({ ...profile, headers: {} })).toBe(true);
    expect(isImageProviderProfile(withOptions({ baseUrl: 'https://api.openai.com.fixture.invalid/v1' }))).toBe(false);
    expect(isImageProviderProfile(withOptions({ baseURL: 'https://api.openai.com/v1?agent=custom' }))).toBe(false);
    expect(isImageProviderProfile(withOptions({ headers: { Authorization: 'fixture' } }))).toBe(false);
    expect(isImageProviderProfile({ ...profile, id: 'openai-codex' })).toBe(false);
  });

  it('keeps older settings disabled and saves only the chosen image options on explicit selection', () => {
    const saved = setup(oldSettings, [profile, alternative]);
    expect(screen.getByRole('button', { name: 'Disattivata' })).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
    choose('Disattivata', 'Illustrazioni');
    expect(saved).toHaveBeenLastCalledWith({
      ...oldSettings,
      imageGeneration: { providerId: 'illustrations', model: 'gpt-image-2.6-sunburst', quality: 'low', size: '1024x1024' },
    });
    choose('GPT Image 2.6 Sunburst', 'GPT Image 2.6 Flare');
    choose('Bassa', 'Massima');
    choose('1024 × 1024', '1024 × 1536');
    choose('Illustrazioni', 'Design');
    expect(saved).toHaveBeenLastCalledWith({ ...oldSettings, imageGeneration: { ...legacySelection, providerId: 'design' } });
    expect(screen.queryByText('synthetic-key-must-not-appear')).not.toBeInTheDocument();
    choose('Design', 'Disattivata');
    expect(saved).toHaveBeenLastCalledWith(oldSettings);
    expect(saved.mock.lastCall?.[0]).not.toHaveProperty('imageGeneration');
  });

  it('does not substitute another account for a missing, disabled or incompatible selection', () => {
    const unsupported: ProviderProfile[] = [
      { ...profile, disabled: true },
      { ...official('openai-codex', 'Codex OAuth'), extensionId: 'openai-codex' },
      { ...official('foreign', 'Estensione'), extensionId: 'foreign' },
      { id: 'compatible', name: 'Compatibile', provider: { name: 'openai-compatible', baseUrl: 'https://fixture.invalid' } } as ProviderProfile,
      {
        ...official('custom', 'URL personalizzata'),
        provider: { name: 'openai', apiKey: 'fixture', useWebSearch: false, baseURL: 'https://fixture.invalid/v1' },
      } as ProviderProfile,
      { ...official('headers', 'Header personalizzati'), headers: { 'OpenAI-Project': 'fixture' } },
      { ...official('keyless', 'Senza chiave'), provider: { name: 'openai', apiKey: ' ', useWebSearch: false } },
    ];
    const saved = setup({ ...oldSettings, imageGeneration: legacySelection }, [...unsupported, alternative]);
    expect(screen.getByRole('button', { name: 'Profilo non disponibile' })).toBeInTheDocument();
    expect(screen.queryByText('GPT Image 2.6 Flare')).not.toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Profilo non disponibile' }));
    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(['Disattivata', 'Design']);
    fireEvent.click(screen.getByRole('option', { name: 'Design' }));
    expect(saved).toHaveBeenLastCalledWith({ ...oldSettings, imageGeneration: { ...legacySelection, providerId: 'design' } });
  });

  it('explains how to configure an account when no native API profiles are present', () => {
    const saved = setup(oldSettings, []);
    expect(screen.getByRole('button', { name: 'Disattivata' })).toBeDisabled();
    expect(screen.getByText(/Libreria modelli/)).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
  });
});
