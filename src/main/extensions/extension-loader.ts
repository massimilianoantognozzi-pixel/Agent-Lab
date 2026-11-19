import path from 'path';
import { realpathSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

import { createJiti, type JitiOptions } from 'jiti';
import { Extension, ExtensionMetadata } from '@common/extensions';

import logger from '@/logger';
import { getProjectAuthorityRoot } from '@/extensions/project-extension-trust';

// Define the interface for the loaded module
interface ExtensionModule {
  default: {
    new (): Extension;
    metadata?: ExtensionMetadata;
  };
}

// Base jiti options shared across all instances
const baseJitiOptions: JitiOptions = {
  fsCache: false,
  moduleCache: false,
  alias: {
    zod: require.resolve('zod'),
    '@aiderdesk/extensions': require.resolve('@aiderdesk/extensions'),
  },
};

const projectSnapshotRoots = new Set<string>();
let installedResolutionGuard = false;

const pathWithin = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const guardApprovedDependencies = (entry: string): void => {
  const storage = path.join(getProjectAuthorityRoot(), 'approved-project-extensions');
  if (!pathWithin(storage, entry)) {
    return;
  }
  const [project, version] = path.relative(storage, entry).split(path.sep);
  if (!/^[0-9a-f]{64}$/.test(project) || !/^[0-9a-f]{64}-[0-9a-f-]{36}$/.test(version)) {
    throw new Error('Invalid approved project extension identity.');
  }
  projectSnapshotRoots.add(realpathSync(path.join(storage, project, version)));
  if (installedResolutionGuard) {
    return;
  }
  const appModules = new Set([require.resolve('zod'), require.resolve('@aiderdesk/extensions')].map((file) => realpathSync(file)));
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : undefined;
      const root = parent && [...projectSnapshotRoots].find((candidate) => pathWithin(candidate, parent));
      const resolved = nextResolve(specifier, context);
      if (!root || resolved.url.startsWith('node:')) {
        return resolved;
      }
      if (!resolved.url.startsWith('file:')) {
        throw new Error('Project extension modules must come from reviewed files.');
      }
      const file = realpathSync(fileURLToPath(resolved.url));
      if (!pathWithin(root, file) && !appModules.has(file)) {
        throw new Error('Project extension dependency is outside the approved snapshot.');
      }
      return resolved;
    },
  });
  installedResolutionGuard = true;
};

export class ExtensionLoader {
  private jitiCache: Map<string, ReturnType<typeof createJiti>> = new Map();

  /**
   * Get or create a jiti instance for a specific extension directory.
   * This ensures module resolution happens relative to the extension's directory.
   */
  private getJitiForExtension(filePath: string): ReturnType<typeof createJiti> {
    const parsedPath = path.parse(filePath);
    const extensionDir = parsedPath.name === 'index' ? parsedPath.dir : path.dirname(filePath);

    // Check if we already have a jiti instance for this directory
    const cached = this.jitiCache.get(extensionDir);
    if (cached) {
      return cached;
    }

    // Create a new jiti instance with the extension directory as base
    const jiti = createJiti(extensionDir, baseJitiOptions);
    this.jitiCache.set(extensionDir, jiti);

    return jiti;
  }

  private deriveExtensionName(filePath: string): string {
    const parsedPath = path.parse(filePath);
    const filename = parsedPath.name;

    // If the file is index.ts or index.js, use the parent folder name
    if (filename === 'index') {
      const parentDir = path.basename(parsedPath.dir);
      return parentDir;
    }

    // Otherwise, use the filename without extension
    return filename;
  }

  async loadExtension(filePath: string): Promise<{ extension: Extension; metadata: ExtensionMetadata } | null> {
    try {
      guardApprovedDependencies(filePath);
      // Use extension-specific jiti instance for proper module resolution
      const jiti = this.getJitiForExtension(filePath);

      // Use jiti to load the file
      // jiti handles TypeScript compilation on the fly
      const module = (await jiti.import(filePath)) as ExtensionModule;

      // Check if default export exists
      if (!module.default) {
        logger.error(`Extension file ${path.basename(filePath)} does not have a default export.`);
        return null;
      }

      const ExtensionClass = module.default;

      // Check if it's a class/constructor
      if (typeof ExtensionClass !== 'function') {
        logger.error(`Extension file ${path.basename(filePath)} default export is not a class.`);
        return null;
      }

      // Check for static metadata, or generate from filename
      let metadata = ExtensionClass.metadata;
      if (!metadata) {
        const generatedName = this.deriveExtensionName(filePath);
        metadata = {
          name: generatedName,
          version: '1.0.0',
        };
        logger.info(`Extension file ${path.basename(filePath)} is missing metadata. Generated name: ${generatedName}`);
      }

      // Instantiate the extension
      const extension = new ExtensionClass();

      return { extension, metadata };
    } catch (error) {
      logger.error(`Failed to load extension from ${filePath}:`, error);
      return null;
    }
  }
}
