import { OS } from './types';

const detectOS = (): OS => {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32' ? OS.Windows : process.platform === 'darwin' ? OS.MacOS : OS.Linux;
  }
  return OS.Linux;
};

export const normalizeBaseDir = (baseDir: string, os: OS = detectOS()): string => {
  if (os === OS.Windows) {
    return baseDir.toLowerCase().replace(/\\+$/, '');
  }
  const wslPrefix = '\\\\wsl.localhost\\';
  if (baseDir.startsWith(wslPrefix)) {
    const thirdBackslashIndex = baseDir.indexOf('\\', wslPrefix.length);
    if (thirdBackslashIndex !== -1) {
      return `/${baseDir.substring(thirdBackslashIndex + 1).replace(/\\/g, '/')}`.replace(/\/+$/, '');
    }
  }
  return baseDir.replace(/\/+$/, '');
};

export const compareBaseDirs = (baseDir1: string, baseDir2: string, os?: OS): boolean => normalizeBaseDir(baseDir1, os) === normalizeBaseDir(baseDir2, os);
