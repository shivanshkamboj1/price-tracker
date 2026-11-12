import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';

export const app: Express = createApp();

export interface TestClient {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
  userId: string;
  email: string;
}

export const ACCESS_PASSWORD = process.env.APP_ACCESS_PASSWORD ?? 'test-access-password';

/**
 * Unlocks the app and returns a cookie-carrying agent plus the CSRF token the
 * SPA would echo back, so tests exercise the same path as the browser.
 *
 * There is one owner, so every client returned here is the same user — calling
 * it twice models two browsers, not two accounts.
 */
export async function createTestClient(
  overrides: Partial<{ password: string }> = {},
): Promise<TestClient> {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/unlock')
    .send({ password: overrides.password ?? ACCESS_PASSWORD })
    .expect(200);

  return {
    agent,
    csrfToken: response.body.data.csrfToken,
    userId: response.body.data.user._id,
    email: response.body.data.user.email,
  };
}

/** Convenience wrappers that attach the CSRF header on state-changing calls. */
export const post = (client: TestClient, url: string, body?: unknown) =>
  client.agent.post(url).set('x-csrf-token', client.csrfToken).send(body as object);

export const patch = (client: TestClient, url: string, body?: unknown) =>
  client.agent.patch(url).set('x-csrf-token', client.csrfToken).send(body as object);

export const del = (client: TestClient, url: string) =>
  client.agent.delete(url).set('x-csrf-token', client.csrfToken);
