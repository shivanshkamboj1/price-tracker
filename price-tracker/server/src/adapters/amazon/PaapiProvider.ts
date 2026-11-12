import crypto from 'node:crypto';
import { request } from 'undici';
import { env } from '../../config/env';
import { AdapterError } from '../../utils/errors';
import { parsePriceToMinor } from '../../utils/money';
import { readJsonBody } from '../http/body';
import { normalizeAvailability } from '../parsing';
import type { FetchContext, ProductDataProvider, ProductIdentity, ProductSnapshot } from '../types';

/**
 * Amazon Product Advertising API 5.0 (`GetItems`).
 *
 * This is the preferred source: it is Amazon's own interface, it is rate limited
 * on their terms, and it requires no page parsing. It needs an approved
 * Associates account, which is why the adapter falls back to other providers
 * when the credentials are absent.
 */
const SERVICE = 'ProductAdvertisingAPI';
const TARGET = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
const PATH = '/paapi5/getitems';

function hmac(key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/** AWS Signature Version 4, as required by PA-API 5.0. */
function signRequest(payload: string, amzDate: string, dateStamp: string): Record<string, string> {
  const host = env.AMAZON_PAAPI_HOST;
  const region = env.AMAZON_PAAPI_REGION;
  const accessKey = env.AMAZON_PAAPI_ACCESS_KEY!;
  const secretKey = env.AMAZON_PAAPI_SECRET_KEY!;

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${TARGET}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const canonicalRequest = [
    'POST',
    PATH,
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), SERVICE),
    'aws4_request',
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host,
    'x-amz-date': amzDate,
    'x-amz-target': TARGET,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

interface PaapiItem {
  ASIN?: string;
  DetailPageURL?: string;
  ItemInfo?: { Title?: { DisplayValue?: string } };
  Images?: { Primary?: { Large?: { URL?: string } } };
  Offers?: {
    Listings?: Array<{
      Price?: { Amount?: number; Currency?: string; DisplayAmount?: string };
      Availability?: { Type?: string; Message?: string };
      MerchantInfo?: { Name?: string };
      SavingBasis?: { Amount?: number };
    }>;
  };
}

export class PaapiProvider implements ProductDataProvider {
  readonly name = 'amazon-paapi';
  readonly source = 'official_api' as const;

  isConfigured(): boolean {
    return Boolean(
      env.AMAZON_PAAPI_ACCESS_KEY && env.AMAZON_PAAPI_SECRET_KEY && env.AMAZON_PAAPI_PARTNER_TAG,
    );
  }

  async fetchProduct(identity: ProductIdentity, _ctx: FetchContext): Promise<ProductSnapshot> {
    if (!this.isConfigured()) {
      throw new AdapterError('not_configured', 'Amazon PA-API credentials are not configured', {
        retryable: false,
      });
    }

    const payload = JSON.stringify({
      ItemIds: [identity.externalProductId],
      Resources: [
        'ItemInfo.Title',
        'Images.Primary.Large',
        'Offers.Listings.Price',
        'Offers.Listings.Availability.Message',
        'Offers.Listings.Availability.Type',
        'Offers.Listings.MerchantInfo',
        'Offers.Listings.SavingBasis',
      ],
      PartnerTag: env.AMAZON_PAAPI_PARTNER_TAG,
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.in',
    });

    const now = new Date();
    const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, '')}`;
    const dateStamp = amzDate.slice(0, 8);

    let res;
    try {
      res = await request(`https://${env.AMAZON_PAAPI_HOST}${PATH}`, {
        method: 'POST',
        headers: signRequest(payload, amzDate, dateStamp),
        body: payload,
        headersTimeout: env.HTTP_TIMEOUT_MS,
        bodyTimeout: env.HTTP_TIMEOUT_MS,
      });
    } catch (err) {
      throw new AdapterError('temporary_error', 'PA-API is unreachable', {
        retryable: true,
        cause: err,
      });
    }

    if (res.statusCode === 429) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('temporary_error', 'PA-API request quota exceeded', {
        retryable: true,
        statusCode: 429,
      });
    }
    if (res.statusCode === 401 || res.statusCode === 403) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('blocked', 'PA-API rejected the credentials', {
        retryable: false,
        statusCode: res.statusCode,
      });
    }
    if (res.statusCode >= 500) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('temporary_error', `PA-API returned ${res.statusCode}`, {
        retryable: true,
        statusCode: res.statusCode,
      });
    }

    const body = await readJsonBody<{
      ItemsResult?: { Items?: PaapiItem[] };
      Errors?: Array<{ Code?: string; Message?: string }>;
    }>(res);

    const item = body.ItemsResult?.Items?.[0];
    if (!item) {
      const code = body.Errors?.[0]?.Code ?? 'ItemNotAccessible';
      throw new AdapterError(
        code === 'InvalidParameterValue' || code === 'ItemNotAccessible'
          ? 'not_found'
          : 'temporary_error',
        `PA-API did not return this item (${code})`,
        { retryable: code !== 'InvalidParameterValue' },
      );
    }

    const listing = item.Offers?.Listings?.[0];
    const price = parsePriceToMinor(listing?.Price?.Amount ?? null);
    const mrp = parsePriceToMinor(listing?.SavingBasis?.Amount ?? null);

    return {
      identity,
      title: item.ItemInfo?.Title?.DisplayValue ?? identity.externalProductId,
      imageUrl: item.Images?.Primary?.Large?.URL,
      price,
      currency: listing?.Price?.Currency ?? 'INR',
      availability: listing
        ? normalizeAvailability(listing.Availability?.Type ?? listing.Availability?.Message)
        : 'out_of_stock',
      source: this.source,
      fetchedAt: new Date(),
      metadata: {
        seller: listing?.MerchantInfo?.Name,
        mrp: mrp ?? undefined,
        provider: this.name,
      },
    };
  }
}
