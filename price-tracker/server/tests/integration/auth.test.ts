import request from 'supertest';
import { ACCESS_PASSWORD, app, createTestClient, post } from '../helpers/api';
import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/db';
import { User } from '../../src/models/User';

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
afterEach(clearDatabase);

describe('POST /api/auth/unlock', () => {
  it('accepts the access password and sets the session cookies', async () => {
    const response = await request(app)
      .post('/api/auth/unlock')
      .send({ password: ACCESS_PASSWORD })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('pt_access='))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith('pt_csrf='))).toBe(true);
    expect(response.body.data.csrfToken).toEqual(expect.any(String));
  });

  it('rejects the wrong password', async () => {
    await request(app)
      .post('/api/auth/unlock')
      .send({ password: 'not-the-password' })
      .expect(401);
  });

  it('requires a password to be supplied', async () => {
    await request(app).post('/api/auth/unlock').send({}).expect(422);
  });

  it('never stores the access password', async () => {
    await createTestClient();
    const owner = await User.findOne().select('+passwordHash');
    expect(owner?.passwordHash).not.toContain(ACCESS_PASSWORD);
  });

  it('reuses one owner rather than creating a user per unlock', async () => {
    const first = await createTestClient();
    const second = await createTestClient();

    expect(second.userId).toBe(first.userId);
    expect(await User.countDocuments()).toBe(1);
  });
});

describe('session handling', () => {
  it('returns the owner from the cookie', async () => {
    const client = await createTestClient();
    const response = await client.agent.get('/api/auth/me').expect(200);
    expect(response.body.data.user._id).toBe(client.userId);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('clears the cookies on lock', async () => {
    const client = await createTestClient();
    await post(client, '/api/auth/lock').expect(200);
    await client.agent.get('/api/auth/me').expect(401);
  });
});

describe('CSRF protection', () => {
  it('rejects a state-changing request without the header', async () => {
    const client = await createTestClient();
    await client.agent.post('/api/products').send({ productUrl: 'https://example.com' }).expect(403);
  });

  it('rejects a mismatched token', async () => {
    const client = await createTestClient();
    await client.agent.post('/api/products').set('x-csrf-token', 'wrong').send({}).expect(403);
  });

  it('allows safe methods without a token', async () => {
    const client = await createTestClient();
    await client.agent.get('/api/products').expect(200);
  });
});
