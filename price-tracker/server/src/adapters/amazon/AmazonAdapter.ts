import { env } from '../../config/env';
import { MARKETPLACE_LABEL, type Marketplace } from '../../config/constants';
import { BaseAdapter } from '../BaseAdapter';
import { AuthorizedProvider } from '../providers/AuthorizedProvider';
import type { DataSourceMode, ProductDataProvider, ProductIdentity } from '../types';
import { PaapiProvider } from './PaapiProvider';
import { AmazonPublicPageProvider } from './PublicPageProvider';
import { isAmazonHost, normalizeAmazonUrl } from './urls';

/**
 * Amazon India.
 *
 * Provider order is fixed by preference — official API, then a licensed data
 * provider, then the public page — and each provider reports whether it is
 * actually configured. Switching sources is `AMAZON_DATA_SOURCE=official` plus
 * credentials; no other file changes.
 */
export class AmazonAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = 'amazon_in';
  readonly label = MARKETPLACE_LABEL.amazon_in;

  private readonly paapi = new PaapiProvider();
  private readonly authorized = new AuthorizedProvider('amazon_in');
  private readonly publicPage = new AmazonPublicPageProvider();

  get dataSource(): DataSourceMode {
    return env.AMAZON_DATA_SOURCE;
  }

  supports(url: URL): boolean {
    return isAmazonHost(url);
  }

  normalizeProductUrl(rawUrl: string): ProductIdentity {
    return normalizeAmazonUrl(rawUrl);
  }

  protected providers(): ProductDataProvider[] {
    switch (this.dataSource) {
      case 'official':
        return [this.paapi];
      case 'provider':
        return [this.authorized];
      case 'public':
        // Even in `public` mode we prefer the official API when credentials exist.
        return [this.paapi, this.authorized, this.publicPage];
      case 'disabled':
      default:
        return [];
    }
  }
}
