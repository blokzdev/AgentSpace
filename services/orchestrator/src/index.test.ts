import { describe, it, expect } from 'vitest';
import { createOrchestrator } from './index';

describe('orchestrator skeleton', () => {
  it('describes itself with the default model', () => {
    const orch = createOrchestrator();
    expect(orch.describe()).toContain('claude-opus-4-8');
  });

  it('accepts an injected default model', () => {
    const orch = createOrchestrator({
      defaultModel: { provider: 'openai', model: 'gpt-x' },
    });
    expect(orch.describe()).toContain('openai/gpt-x');
  });
});
