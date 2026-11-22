import { useTranslation } from 'react-i18next';
import { isImageProviderProfile } from '@common/agent';

import { Section } from '../common/Section';
import { Select } from '../common/Select';

import type { ProviderProfile, SettingsData } from '@common/types';

type ImageOptions = NonNullable<SettingsData['imageGeneration']>;
type Props = {
  settings: SettingsData;
  providers: ProviderProfile[];
  setSettings: (settings: SettingsData) => void;
};

const models = [
  { value: 'gpt-image-2.6-sunburst', label: 'GPT Image 2.6 Sunburst' },
  { value: 'gpt-image-2.6-flare', label: 'GPT Image 2.6 Flare' },
] as const;

const qualities: ImageOptions['quality'][] = ['low', 'medium', 'high', 'xhigh', 'max'];
const sizes: ImageOptions['size'][] = ['1024x1024', '1536x1024', '1024x1536'];

export const ImageGenerationSettings = ({ settings, providers, setSettings }: Props) => {
  const { t } = useTranslation();
  const current = settings.imageGeneration;
  const available = providers.filter(isImageProviderProfile);
  const active = current && available.some((profile) => profile.id === current.providerId);

  const chooseProvider = (providerId: string) => {
    if (!providerId) {
      const updated = { ...settings };
      delete updated.imageGeneration;
      setSettings(updated);
    } else if (available.some((profile) => profile.id === providerId)) {
      setSettings({
        ...settings,
        imageGeneration: {
          providerId,
          model: current?.model ?? 'gpt-image-2.6-sunburst',
          quality: current?.quality ?? 'low',
          size: current?.size ?? '1024x1024',
        },
      });
    }
  };

  return (
    <Section id="general-image-generation" title={t('settings.imageGeneration.title')}>
      <div className="space-y-4 px-4 py-5">
        <Select
          label={t('settings.voice.providerProfile')}
          value={current?.providerId ?? ''}
          options={[
            { value: '', label: t('settings.imageGeneration.off') },
            ...available.map((profile) => ({ value: profile.id, label: profile.name || (profile.id === 'openai' ? 'OpenAI' : `OpenAI (${profile.id})`) })),
          ]}
          notFoundLabel={t('settings.imageGeneration.unavailable')}
          disabled={!current && available.length === 0}
          onChange={chooseProvider}
          size="sm"
        />
        {active && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select
                label={t('model.label')}
                value={current.model}
                options={[...models]}
                onChange={(value) => {
                  const model = models.find((option) => option.value === value);
                  if (model) {
                    setSettings({ ...settings, imageGeneration: { ...current, model: model.value } });
                  }
                }}
                size="sm"
              />
              <Select
                label={t('settings.imageGeneration.quality')}
                value={current.quality}
                options={qualities.map((value) => ({ value, label: t(`settings.imageGeneration.qualities.${value}`) }))}
                onChange={(value) => {
                  const quality = qualities.find((option) => option === value);
                  if (quality) {
                    setSettings({ ...settings, imageGeneration: { ...current, quality } });
                  }
                }}
                size="sm"
              />
              <Select
                label={t('settings.imageGeneration.size')}
                value={current.size}
                options={sizes.map((value) => ({ value, label: value.replace('x', ' × ') }))}
                onChange={(value) => {
                  const size = sizes.find((option) => option === value);
                  if (size) {
                    setSettings({ ...settings, imageGeneration: { ...current, size } });
                  }
                }}
                size="sm"
              />
            </div>
            <p className="text-xs text-text-muted">{t('settings.imageGeneration.credits')}</p>
          </>
        )}
        {!active && (current || available.length === 0) && <p className="text-xs text-text-muted">{t('settings.imageGeneration.configure')}</p>}
      </div>
    </Section>
  );
};
