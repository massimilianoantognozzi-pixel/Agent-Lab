import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('fs');
vi.unmock('node:fs');
vi.unmock('fs/promises');
vi.unmock('node:fs/promises');
vi.unmock('path');
vi.unmock('node:path');
import {
  beginGeneralKnowledgeRun,
  compileGeneralKnowledge,
  endGeneralKnowledgeRun,
  observeGeneralToolResult,
  searchGeneralKnowledge,
} from '../general-knowledge';
import { sanitizeKnowledgeText } from '../knowledge-privacy';

describe('General knowledge privacy and evidence', () => {
  let directory: string;
  let data: string;
  let runId: string;
  const generator = () =>
    vi.fn(async () =>
      JSON.stringify({
        title: 'Validazione esplicita',
        lesson: 'Usare funzioni chiare e verificare gli input. Il comando osservato non certifica tutto il progetto.',
        applicability: 'Codice con validazione degli input',
      }),
    );
  beforeEach(async () => {
    const base = path.resolve('lab/work/general-knowledge-unit', randomUUID());
    directory = path.join(base, 'project');
    data = path.join(base, 'data');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'module.py'), 'def validate(value):\n    return isinstance(value, int)\n');
    vi.stubEnv('AIDER_DESK_DATA_DIR', data);
    runId = await beginGeneralKnowledgeRun(directory, 'unit');
    await observeGeneralToolResult(directory, 'unit', 'power---file_read', { filePath: 'module.py' }, 'file content', runId);
  });
  afterEach(() => {
    endGeneralKnowledgeRun(directory, 'unit', runId);
    vi.unstubAllEnvs();
  });
  const command = async (directory: string, runId: string, exitCode = 0) =>
    observeGeneralToolResult(
      directory,
      'unit',
      'power---bash',
      { command: 'python -m unittest --token PERSONAL_COMMAND_SECRET' },
      { exitCode, stdout: 'Authorization: Bearer PRIVATE_OUTPUT_SECRET', stderr: '' },
      runId,
      { cwd: directory },
    );
  it('stores a model-generated lesson with scoped native facts and no raw command/output', async () => {
    await command(directory, runId);
    const generate = generator();
    const entry = await compileGeneralKnowledge(directory, 'local-test', generate, runId);
    expect(entry?.interpretation).toBe('model-generated-not-a-rule');
    expect(entry?.facts).toMatchObject({ program: 'python', exitCode: 0 });
    expect(JSON.stringify(generate.mock.calls)).not.toContain('PERSONAL_COMMAND_SECRET');
    expect(JSON.stringify(generate.mock.calls)).not.toContain('PRIVATE_OUTPUT_SECRET');
    expect(JSON.stringify(entry)).not.toContain('PERSONAL_COMMAND_SECRET');
    expect((await searchGeneralKnowledge('validazione')).length).toBe(1);
    const folders = fs.readdirSync(path.join(data, 'knowledge-base')).filter((name) => /^[a-f0-9]{64}$/.test(name));
    const evidence = fs.readdirSync(path.join(data, 'knowledge-base', folders[0], 'evidence'))[0];
    const stored = fs.readFileSync(path.join(data, 'knowledge-base', folders[0], 'evidence', evidence), 'utf8');
    expect(stored).not.toContain('PRIVATE_OUTPUT_SECRET');
    expect(stored).not.toContain('PERSONAL_COMMAND_SECRET');
  });
  it('does not accept an extension/model-step success as native command evidence', async () => {
    await observeGeneralToolResult(directory, 'unit', 'power---bash', { command: 'fake' }, { exitCode: 0, stdout: 'pretend pass' }, runId);
    const generate = generator();
    expect(await compileGeneralKnowledge(directory, 'local-test', generate, runId)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
  it('does not promote failed commands or changed post-command files', async () => {
    await command(directory, runId, 1);
    const generate = generator();
    expect(await compileGeneralKnowledge(directory, 'local-test', generate, runId)).toBeNull();
    await command(directory, runId);
    fs.appendFileSync(path.join(directory, 'module.py'), '# changed after\n');
    await expect(compileGeneralKnowledge(directory, 'local-test', generate, runId)).rejects.toThrow('file cambiati');
    expect(generate).not.toHaveBeenCalled();
  });
  it('redacts secrets from code before the generator sees examples', async () => {
    const secret = 'EXAMPLE_PRIVATE_VALUE_123456789';
    fs.writeFileSync(path.join(directory, 'module.py'), `api_key = '${secret}'\n`);
    await command(directory, runId);
    const generate = generator();
    await compileGeneralKnowledge(directory, 'local-test', generate, runId);
    expect(JSON.stringify(generate.mock.calls)).not.toContain(secret);
    expect(sanitizeKnowledgeText('Authorization: Bearer abcdefgh12345')).not.toContain('abcdefgh12345');
  });
  it('omits external symlink contents from automatic capture without blocking native access', async () => {
    const outside = path.join(path.dirname(directory), 'external');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'outside.py'), 'EXTERNAL_PROJECT_CONTENT');
    fs.symlinkSync(outside, path.join(directory, 'linked'), 'junction');
    await observeGeneralToolResult(directory, 'unit', 'power---file_read', { filePath: 'linked/outside.py' }, 'successful read', runId);
    await command(directory, runId);
    const generate = generator();
    await compileGeneralKnowledge(directory, 'local-test', generate, runId);
    expect(JSON.stringify(generate.mock.calls)).not.toContain('EXTERNAL_PROJECT_CONTENT');
  });
  it('keeps simultaneous runs on the same task separate and ends only the owner run', async () => {
    const second = await beginGeneralKnowledgeRun(directory, 'unit');
    await command(directory, runId);
    await command(directory, second);
    endGeneralKnowledgeRun(directory, 'unit', runId);
    expect(await compileGeneralKnowledge(directory, 'local-test', generator(), runId)).toBeNull();
    expect(await compileGeneralKnowledge(directory, 'local-test', generator(), second)).not.toBeNull();
    endGeneralKnowledgeRun(directory, 'unit', second);
  });
  it('rejects invalid model JSON instead of persisting a fake lesson', async () => {
    await command(directory, runId);
    await expect(compileGeneralKnowledge(directory, 'local-test', async () => '{invalid', runId)).rejects.toThrow();
    expect(await searchGeneralKnowledge('anything')).toHaveLength(0);
  });
});
