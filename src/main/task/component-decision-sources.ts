import { posix } from 'node:path';

const decisionLabel = /\b(?:blueprints?|designs?|decisions?|decision[ei]|decisional[ei]|progettazione)\b/u;
const historical =
  /\b(?:archiv(?:e[ds]?|io|i|iat[oaie])|storic[oaie]|history|historical|passat[oaie]|past|old|legacy|superseded|obsolete|obsolet[oaie]|previous|precedent[ei]|esit[oi]|risultat[oi]|results?|reports?|changelogs?)\b/u;
const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');

const localPath = (value: string) =>
  !!value &&
  !value.startsWith('/') &&
  !value.startsWith('~') &&
  !/[\\:?]/u.test(value) &&
  Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);

const resolveLink = (owner: string, destination: string): string | undefined => {
  const [raw] = destination.split('#', 1);
  if (!localPath(raw) || /%(?:2f|5c)/i.test(raw)) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  if (!localPath(decoded) || !/\.md$/i.test(decoded) || historical.test(words(decoded))) {
    return undefined;
  }
  const candidate = posix.join(posix.dirname(owner), decoded);
  if (candidate === '..' || candidate.startsWith('../')) {
    return undefined;
  }
  return candidate;
};

// Only explicit Markdown links are declarations. A code span can itself be a label, but an example inside a code span is not a link.
const inline = /(`+)(.*?)\1|(?<![!\\])\[([^[\]]+)\]\(\s*(?:<([^<>]+)>|((?:[^\s()<>]|\([^\s()<>]*\))+))(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/gu;

export const componentDecisionReferences = (owner: string, content: string, available: ReadonlySet<string>): string[] => {
  const normalizedOwner = owner.replaceAll('\\', '/');
  if (
    !localPath(normalizedOwner) ||
    normalizedOwner.startsWith('../') ||
    historical.test(words(normalizedOwner)) ||
    posix.normalize(normalizedOwner) !== normalizedOwner ||
    !/^(?:AGENTS(?:\.override)?|DESIGN)\.md$/i.test(posix.basename(normalizedOwner))
  ) {
    return [];
  }

  const references = new Set<string>();
  let fence = '';
  let historicalLevel = 0;
  for (const line of content.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ').split(/\r\n|[\r\n]/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (delimiter && delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) {
        fence = '';
      }
      continue;
    }
    if (delimiter) {
      fence = delimiter[1];
      continue;
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (historicalLevel && level <= historicalLevel) {
        historicalLevel = 0;
      }
      if (!historicalLevel && historical.test(words(heading[2]))) {
        historicalLevel = level;
      }
    }
    if (historicalLevel || (/^(?: {4}|\t)/.test(line) && !/^\s*(?:[-+*]|\d+[.)])[ \t]+/.test(line))) {
      continue;
    }

    for (const match of line.matchAll(inline)) {
      const label = words(match[3] ?? '');
      if (decisionLabel.test(label) && !historical.test(label) && !/^(?:tests?|testing|collaud[oi]|verific(?:a|he)|prov[ae])\b/.test(label.trim())) {
        const candidate = resolveLink(normalizedOwner, match[4] ?? match[5]);
        if (candidate && available.has(candidate)) {
          references.add(candidate);
        }
      }
    }
  }
  return [...references];
};
