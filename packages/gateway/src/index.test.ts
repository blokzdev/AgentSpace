import { describe, it, expect } from 'vitest';
import { createModelGateway } from './index';

describe('model gateway (stub)', () => {
  it('exposes the gateway surface', () => {
    const gw = createModelGateway();
    expect(typeof gw.stream).toBe('function');
    expect(typeof gw.embed).toBe('function');
  });

  it('embed rejects until implemented', async () => {
    const gw = createModelGateway();
    await expect(gw.embed(['hello'])).rejects.toThrow(/stub/);
  });
});
