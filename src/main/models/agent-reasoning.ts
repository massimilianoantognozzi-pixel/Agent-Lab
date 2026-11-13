export const defaultAgentReasoning = (provider: string, model: string): 'high' | undefined =>
  process.env.AIDER_DESK_CODEX_SOL_HIGH === 'true' && provider === 'openai-codex' && model === 'gpt-6.1-sol' ? 'high' : undefined;
