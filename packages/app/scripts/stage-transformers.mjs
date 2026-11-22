import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

export async function stageTransformers(producer, destination, cliManifest) {
  const name = '@huggingface/transformers';
  const source = path.join(producer, 'node_modules', name);
  const installed = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  if (installed.version !== cliManifest.devDependencies[name]) throw new Error('Unexpected Transformers build input.');

  const resolveFromLibrary = createRequire(path.join(source, 'package.json'));
  const installedManifest = async (dependency) => {
    const files = resolveFromLibrary.resolve.paths(dependency).map((dir) => path.join(dir, dependency, 'package.json'));
    const file = files.find(existsSync);
    if (!file || path.relative(producer, file).startsWith('..')) throw new Error(`Missing locked dependency: ${dependency}`);
    return { directory: path.dirname(file), manifest: JSON.parse(await fs.readFile(file, 'utf8')) };
  };
  // The upstream Node entry also imports onnxruntime-common. npm installs these packages on the consumer's platform.
  const external = new Set([...Object.keys(installed.dependencies), 'onnxruntime-common']);
  external.delete('sharp');
  for (const dependency of external) {
    const actual = await installedManifest(dependency);
    if (cliManifest.dependencies[dependency] !== actual.manifest.version) {
      throw new Error(`Pin the CLI runtime dependency ${dependency} to the reviewed version ${actual.manifest.version}.`);
    }
  }
  const sharp = await installedManifest('sharp');
  if (sharp.manifest.name !== 'empty-npm-package' || cliManifest.overrides[name]?.sharp !== `npm:${sharp.manifest.name}@${sharp.manifest.version}`) {
    throw new Error('The private Transformers package requires the reviewed Sharp replacement.');
  }

  const target = path.join(destination, name);
  await fs.cp(source, target, {
    recursive: true,
    filter(file) {
      if (path.basename(file) === 'node_modules') return false;
      if (/\.(?:node|dll|exe|dylib|so(?:\.\d+)*)$/i.test(file)) throw new Error('Platform binary found in portable Transformers assets.');
      return true;
    },
  });
  await fs.mkdir(path.join(target, 'node_modules'));
  await fs.cp(sharp.directory, path.join(target, 'node_modules', 'sharp'), { recursive: true });
}
