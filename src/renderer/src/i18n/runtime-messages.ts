import type { TFunction } from 'i18next';

// Keep protocol/log content intact; localize only known application status messages at display time.
const statusKeys: Record<string, string> = {
  'Reflecting message...': 'messages.reflecting',
  'Editing files...': 'messages.editingFiles',
  'Processing request...': 'messages.processingRequest',
  'Linting...': 'messages.linting',
  'Generating commit message...': 'messages.generatingCommit',
  'Committing changes...': 'messages.committing',
  'Files have been updated.': 'messages.filesUpdated',
  'File has been updated.': 'messages.fileUpdated',
  'No repo map available.': 'messages.noRepoMap',
  'The repo map has been refreshed.': 'messages.repoMapRefreshed',
};

export const localizeRuntimeMessage = (content: string, t: TFunction, translateLegacyKey = false): string => {
  const iterationLimit =
    /^The Agent has reached the maximum number of allowed iterations \((\d+)\)\. To allow more iterations, go to Settings -> Agent -> Parameters and increase Max Iterations\.$/.exec(
      content,
    );
  if (iterationLimit) {
    return t('messages.agentIterationLimit', { limit: iterationLimit[1] });
  }
  const key = Object.hasOwn(statusKeys, content) ? statusKeys[content] : undefined;
  return key ? t(key) : translateLegacyKey ? t(content) : content;
};
