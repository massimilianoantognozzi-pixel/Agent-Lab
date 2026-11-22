import { useTranslation } from 'react-i18next';

import { MessageImages } from './MessageImages';

import type { ToolContentResult, ToolResultImage } from './utils';
import type { ToolMessage } from '@common/types';

type Props = {
  images: ToolResultImage[];
  outputPath?: string;
};

export const generatedImagePreview = (message: ToolMessage, result: ToolContentResult | null): Props | null => {
  const hasPreview =
    (message.serverName === 'images' && message.toolName === 'result') || (message.serverName === 'documents' && message.toolName === 'generate');
  if (!hasPreview || message.isStreaming || result?.isError || !result?.images.length) {
    return null;
  }
  const images = result.images.filter((image) => image.mediaType === 'image/png');
  if (!images.length) {
    return null;
  }
  const output = result.json && 'output' in result.json ? result.json.output : undefined;
  return {
    images,
    outputPath: typeof output === 'string' && output.trim() ? output : undefined,
  };
};

export const ToolResultImages = ({ images, outputPath }: Props) => {
  const { t } = useTranslation();

  if (images.length === 0) {
    return null;
  }

  const dataUrls = images.map((image) => `data:${image.mediaType};base64,${image.data}`);

  return (
    <div className="mt-2">
      <div className="text-text-secondary text-xs font-semibold mb-1">
        {outputPath ? <code className="break-all">{outputPath}</code> : t('toolMessage.images', { count: images.length })}
      </div>
      <MessageImages
        images={dataUrls}
        altPrefix={outputPath || 'Tool result image'}
        thumbnailClassName="max-h-40 max-w-[200px] rounded-md border border-border-dark-light cursor-pointer hover:opacity-80 transition-opacity object-contain"
      />
    </div>
  );
};
