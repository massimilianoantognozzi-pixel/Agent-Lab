export const CODEX_PLAN_MODE = 'codex-plan';

export const CODEX_PLAN_INSTRUCTIONS =
  'Work in Plan mode. Explore the repository with read-only tools to resolve discoverable questions. Do not edit repository files, implement the plan, or perform other mutations. Ask the user only for decisions that materially affect the plan and cannot be discovered from the repository. When the plan is ready, provide a decision-complete implementation and test plan inside <proposed_plan> and </proposed_plan> tags, each on its own line. When revising, return a complete replacement. An explicit switch to Agent mode and implementation request is required before implementation.';

const explorationTools = new Set(['power---file_read', 'power---glob', 'power---grep', 'power---fetch', 'power---web_search']);

export const isPlanExplorationTool = (name: string) => explorationTools.has(name);
