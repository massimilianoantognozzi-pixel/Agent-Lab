import { afterEach, describe, expect, it, vi } from 'vitest';

import { search } from '../probe';

import { execWithShellPath } from '@/utils/shell';

vi.mock('@/constants', () => ({ PROBE_BINARY_PATH: 'C:/Tools/Probe Portable/probe.exe' }));
vi.mock('@/utils/shell', () => ({ execWithShellPath: vi.fn() }));

describe('Probe search argument handling', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('passes the query, Windows path, and option values as separate data arguments', async () => {
    vi.mocked(execWithShellPath).mockResolvedValue({ stdout: 'matches', stderr: '' });
    const query = 'interface "Card Props"';
    const directory = 'C:\\Work Space\\project';

    await expect(search({ query, path: directory, maxResults: 0, ignore: 'example files/**', exact: true, allowTests: false })).resolves.toBe('matches');

    expect(execWithShellPath).toHaveBeenCalledExactlyOnceWith([
      'C:/Tools/Probe Portable/probe.exe',
      'search',
      '--ignore',
      'example files/**',
      '--exact',
      '--max-results',
      '0',
      '--',
      query,
      directory,
    ]);
  });

  it('retains structured output without requiring an explicit search directory', async () => {
    vi.mocked(execWithShellPath).mockResolvedValue({ stdout: '{"matches":[]}', stderr: '' });

    await expect(search({ query: 'renderPanel', json: true, format: 'json' })).resolves.toEqual({ matches: [] });

    expect(execWithShellPath).toHaveBeenCalledExactlyOnceWith(['C:/Tools/Probe Portable/probe.exe', 'search', '--format', 'json', '--', 'renderPanel']);
  });
});
