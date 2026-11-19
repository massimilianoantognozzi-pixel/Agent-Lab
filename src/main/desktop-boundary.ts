import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDev } from '@/app';

export const isDesktopRendererUrl = (input: string): boolean => {
  try {
    const url = new URL(input);
    if (url.protocol === 'file:') {
      return !path.relative(path.join(__dirname, '../renderer/index.html'), fileURLToPath(url));
    }
    const dev = isDev() ? process.env.ELECTRON_RENDERER_URL : undefined;
    return Boolean(dev && ['http:', 'https:'].includes(url.protocol) && url.origin === new URL(dev).origin);
  } catch {
    return false;
  }
};

export const desktopExternalUrl = (input: string): string | undefined => {
  try {
    const url = new URL(input);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

export const isWebViewUrl = (input: string): boolean => {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  } catch {
    return false;
  }
};
