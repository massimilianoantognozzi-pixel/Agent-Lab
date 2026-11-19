import { describe, expect, it } from 'vitest';

import { startReviewServer } from '../../../../packages/extensions/extensions/plannotator/server';

describe('optional Plannotator review access', () => {
  it('opens a loopback review only after its one-time ticket is exchanged', async () => {
    const review = await startReviewServer({
      rawPatch: 'fixture diff',
      gitRef: 'fixture',
      htmlContent: '<p>Fixture</p>',
    });
    try {
      const start = new URL(review.url);
      expect(start.hostname).toBe('127.0.0.1');
      const contents = new URL('/api/diff', start);
      expect((await fetch(contents)).status).toBe(401);

      const admitted = await fetch(start, { redirect: 'manual' });
      expect(admitted.status).toBe(303);
      expect(admitted.headers.get('location')).toBe('/');
      const cookie = admitted.headers.get('set-cookie')!.split(';')[0];
      expect((await fetch(start, { redirect: 'manual' })).status).toBe(401);

      const authenticated = await fetch(contents, { headers: { cookie } });
      expect(authenticated.status).toBe(200);
      expect(await authenticated.json()).toMatchObject({
        rawPatch: 'fixture diff',
      });
    } finally {
      review.stop();
    }
  });

  it('denies anonymous decisions and cookies belonging to another review', async () => {
    const review = await startReviewServer({
      rawPatch: 'first fixture',
      gitRef: 'first',
      htmlContent: '<p>Fixture</p>',
    });
    const other = await startReviewServer({
      rawPatch: 'second fixture',
      gitRef: 'second',
      htmlContent: '<p>Fixture</p>',
    });
    try {
      const decision = new URL('/api/feedback', review.url);
      const body = JSON.stringify({ feedback: 'approved synthetic fixture' });
      const request = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      };
      expect((await fetch(decision, request)).status).toBe(401);
      const firstSession = await fetch(review.url, { redirect: 'manual' });
      const secondSession = await fetch(other.url, { redirect: 'manual' });
      const cookie = firstSession.headers.get('set-cookie')!.split(';')[0];
      const otherCookie = secondSession.headers.get('set-cookie')!.split(';')[0];
      expect(
        (
          await fetch(decision, {
            ...request,
            headers: { ...request.headers, cookie: otherCookie },
          })
        ).status,
      ).toBe(401);
      const accepted = await fetch(decision, {
        ...request,
        headers: { ...request.headers, cookie },
      });
      expect(accepted.status).toBe(200);
      expect(await review.waitForDecision()).toEqual({
        feedback: 'approved synthetic fixture',
      });
    } finally {
      review.stop();
      other.stop();
    }
  });
});
