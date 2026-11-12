import request from 'supertest';
import { Types } from 'mongoose';
import { app, createTestClient, del, patch, post, type TestClient } from '../helpers/api';
import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/db';
import { Product } from '../../src/models/Product';
import { PriceHistory } from '../../src/models/PriceHistory';
import { enqueuePriceCheck } from '../../src/queues';

const AMAZON_URL =
  'https://www.amazon.in/Apple-AirPods-Pro/dp/B0CHWRXH8B/ref=sr_1_3?tag=affiliate-21';
const FLIPKART_URL =
  'https://www.flipkart.com/apple-airpods-pro/p/itm123abc?pid=ACCGSXYZ12345678&lid=LSTxyz';

const addProduct = (client: TestClient, body: Record<string, unknown> = {}) =>
  post(client, '/api/products', {
    productUrl: AMAZON_URL,
    targetPrice: 19999,
    checkInterval: 360,
    ...body,
  });

/**
 * A product owned by somebody else, written straight to the database.
 *
 * There is only one account now, so a second *client* is no longer a second
 * user. Ownership scoping is still enforced on every query, and this is what
 * exercises it.
 */
const createForeignProduct = () =>
  Product.create({
    userId: new Types.ObjectId(),
    marketplace: 'amazon_in',
    productUrl: 'https://www.amazon.in/dp/B0STRANGER',
    externalProductId: 'B0STRANGER',
    title: 'Not yours',
    targetPrice: 100000,
    checkInterval: 360,
    nextCheckAt: new Date(),
    status: 'active',
    availability: 'unknown',
  });

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
afterEach(clearDatabase);

describe('POST /api/products', () => {
  it('detects the marketplace from the URL and canonicalises it', async () => {
    const client = await createTestClient();
    const response = await addProduct(client).expect(201);

    expect(response.body.data.product).toMatchObject({
      marketplace: 'amazon_in',
      externalProductId: 'B0CHWRXH8B',
      productUrl: 'https://www.amazon.in/dp/B0CHWRXH8B',
      targetPrice: 19999,
      status: 'active',
    });
  });

  it('enqueues the first check instead of fetching inline', async () => {
    const client = await createTestClient();
    const response = await addProduct(client).expect(201);

    expect(enqueuePriceCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: response.body.data.product.id,
        marketplace: 'amazon_in',
        trigger: 'manual',
      }),
    );
  });

  it('rejects a marketplace value that disagrees with the link', async () => {
    const client = await createTestClient();
    const response = await addProduct(client, { marketplace: 'flipkart' }).expect(400);
    expect(response.body.error.message).toMatch(/does not match/);
  });

  it('rejects an unsupported marketplace', async () => {
    const client = await createTestClient();
    const response = await addProduct(client, {
      productUrl: 'https://www.myntra.com/shoes/123',
    }).expect(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_MARKETPLACE');
  });

  it('rejects a check interval more aggressive than the floor', async () => {
    const client = await createTestClient();
    await addProduct(client, { checkInterval: 5 }).expect(422);
  });

  it('refuses to track the same product twice for one user', async () => {
    const client = await createTestClient();
    await addProduct(client).expect(201);
    // A different link to the same ASIN is still the same product.
    await addProduct(client, { productUrl: 'https://www.amazon.in/gp/product/B0CHWRXH8B' }).expect(409);
  });

  it('requires authentication', async () => {
    await request(app).post('/api/products').send({ productUrl: AMAZON_URL }).expect(401);
  });
});

describe('POST /api/products/preview', () => {
  it('reports the detected marketplace without contacting it', async () => {
    const client = await createTestClient();
    const response = await post(client, '/api/products/preview', {
      productUrl: FLIPKART_URL,
    }).expect(200);

    expect(response.body.data).toMatchObject({
      marketplace: 'flipkart',
      externalProductId: 'ACCGSXYZ12345678',
    });
  });
});

describe('GET /api/products', () => {
  it('returns only the caller’s products', async () => {
    const owner = await createTestClient();

    await addProduct(owner).expect(201);
    await createForeignProduct();

    const ownerList = await owner.agent.get('/api/products').expect(200);

    expect(ownerList.body.data).toHaveLength(1);
    expect(ownerList.body.meta.total).toBe(1);
  });

  it('filters by status and marketplace', async () => {
    const client = await createTestClient();
    await addProduct(client).expect(201);
    await addProduct(client, { productUrl: FLIPKART_URL }).expect(201);

    const amazonOnly = await client.agent.get('/api/products?marketplace=amazon_in').expect(200);
    expect(amazonOnly.body.data).toHaveLength(1);
    expect(amazonOnly.body.meta.total).toBe(1);
  });

  it('treats a search string as text, not as a regular expression', async () => {
    const client = await createTestClient();
    await addProduct(client, { nickname: 'AirPods (Pro)' }).expect(201);

    const response = await client.agent.get('/api/products?search=AirPods%20(Pro)').expect(200);
    expect(response.body.data).toHaveLength(1);
  });
});

describe('authorization on a single product', () => {
  it('hides another user’s product behind a 404', async () => {
    const client = await createTestClient();
    const foreign = await createForeignProduct();
    const id = foreign._id.toString();

    await client.agent.get(`/api/products/${id}`).expect(404);
    await patch(client, `/api/products/${id}`, { targetPrice: 1 }).expect(404);
    await del(client, `/api/products/${id}`).expect(404);
    await client.agent.get(`/api/products/${id}/history`).expect(404);
    await post(client, `/api/products/${id}/check`).expect(404);
  });

  it('returns 404 for a malformed id rather than a 500', async () => {
    const client = await createTestClient();
    await client.agent.get('/api/products/not-an-object-id').expect(422);
  });
});

describe('PATCH /api/products/:id', () => {
  it('updates the target price and re-arms alerts', async () => {
    const client = await createTestClient();
    const created = await addProduct(client).expect(201);
    const id = created.body.data.product.id;

    await Product.updateOne({ _id: id }, { $set: { alertArmed: true } });

    const response = await patch(client, `/api/products/${id}`, { targetPrice: 17500 }).expect(200);

    expect(response.body.data.product.targetPrice).toBe(17500);
    expect(response.body.data.product.alertArmed).toBe(false);
  });

  it('pauses and resumes tracking', async () => {
    const client = await createTestClient();
    const created = await addProduct(client).expect(201);
    const id = created.body.data.product.id;

    const paused = await patch(client, `/api/products/${id}`, { status: 'paused' }).expect(200);
    expect(paused.body.data.product.status).toBe('paused');

    const resumed = await patch(client, `/api/products/${id}`, { status: 'active' }).expect(200);
    expect(resumed.body.data.product.status).toBe('active');
  });

  it('rejects an unknown status value', async () => {
    const client = await createTestClient();
    const created = await addProduct(client).expect(201);
    await patch(client, `/api/products/${created.body.data.product.id}`, {
      status: 'deleted',
    }).expect(422);
  });

  it('ignores fields the client is not allowed to set', async () => {
    const client = await createTestClient();
    const created = await addProduct(client).expect(201);
    const id = created.body.data.product.id;

    // `currentPrice` is not in the schema, so Zod strips it before it reaches Mongo.
    await patch(client, `/api/products/${id}`, { targetPrice: 100, currentPrice: 1 }).expect(200);

    const product = await Product.findById(id);
    expect(product?.currentPrice).toBeUndefined();
  });
});

describe('DELETE /api/products/:id', () => {
  it('removes the product and its history', async () => {
    const client = await createTestClient();
    const created = await addProduct(client).expect(201);
    const id = created.body.data.product.id;

    await PriceHistory.create({
      productId: id,
      userId: client.userId,
      price: 1_999_900,
      currency: 'INR',
      availability: 'in_stock',
      checkedAt: new Date(),
      source: 'public_page',
    });

    await del(client, `/api/products/${id}`).expect(204);

    await client.agent.get(`/api/products/${id}`).expect(404);
    expect(await PriceHistory.countDocuments({ productId: id })).toBe(0);
  });
});

describe('POST /api/products/:id/check', () => {
  it('queues a manual check and reports the remaining budget', async () => {
    const client = await createTestClient();
    const created = await addProduct(client).expect(201);

    const response = await post(client, `/api/products/${created.body.data.product.id}/check`).expect(
      202,
    );

    expect(response.body.data.queued).toBe(true);
    expect(response.body.data.remainingThisHour).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/products/:id/history', () => {
  it('returns points and statistics in major units', async () => {
    const client = await createTestClient();
    const created = await addProduct(client).expect(201);
    const id = created.body.data.product.id;

    await PriceHistory.insertMany([
      {
        productId: id,
        userId: client.userId,
        price: 2_499_900,
        currency: 'INR',
        availability: 'in_stock',
        checkedAt: new Date(Date.now() - 2 * 86_400_000),
        source: 'public_page',
      },
      {
        productId: id,
        userId: client.userId,
        price: 1_999_900,
        currency: 'INR',
        availability: 'in_stock',
        checkedAt: new Date(Date.now() - 86_400_000),
        source: 'public_page',
      },
    ]);

    const response = await client.agent.get(`/api/products/${id}/history?range=30d`).expect(200);

    expect(response.body.data.points).toHaveLength(2);
    expect(response.body.data.points[0].price).toBe(24999);
    expect(response.body.data.stats).toMatchObject({ lowest: 19999, highest: 24999, points: 2 });
    expect(response.body.data.targetPrice).toBe(19999);
  });

  it('rejects an unknown range', async () => {
    const client = await createTestClient();
    const created = await addProduct(client).expect(201);
    await client.agent
      .get(`/api/products/${created.body.data.product.id}/history?range=forever`)
      .expect(422);
  });
});

describe('GET /api/dashboard/stats', () => {
  it('summarises only the caller’s data', async () => {
    const client = await createTestClient();
    await addProduct(client).expect(201);
    await addProduct(client, { productUrl: FLIPKART_URL }).expect(201);

    const response = await client.agent.get('/api/dashboard/stats').expect(200);

    expect(response.body.data).toMatchObject({ trackedProducts: 2, activeProducts: 2 });
    expect(response.body.data.byMarketplace).toHaveLength(2);
  });
});

describe('input sanitisation', () => {
  it('strips Mongo operators from the request body', async () => {
    const client = await createTestClient();
    const response = await post(client, '/api/products', {
      productUrl: AMAZON_URL,
      targetPrice: { $gt: 0 },
      checkInterval: 360,
    }).expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
