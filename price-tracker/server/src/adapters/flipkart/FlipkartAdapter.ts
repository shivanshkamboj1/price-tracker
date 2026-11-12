import { env } from '../../config/env';
import { MARKETPLACE_LABEL, type Marketplace } from '../../config/constants';
import { BaseAdapter } from '../BaseAdapter';
import { AuthorizedProvider } from '../providers/AuthorizedProvider';
import type { DataSourceMode, ProductDataProvider, ProductIdentity } from '../types';
import { FlipkartAffiliateProvider } from './AffiliateProvider';
import { FlipkartPublicPageProvider } from './PublicPageProvider';
import { isFlipkartHost, normalizeFlipkartUrl } from './urls';

export class FlipkartAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = 'flipkart';
  readonly label = MARKETPLACE_LABEL.flipkart;

  private readonly affiliate = new FlipkartAffiliateProvider();
  private readonly authorized = new AuthorizedProvider('flipkart');
  private readonly publicPage = new FlipkartPublicPageProvider();

  get dataSource(): DataSourceMode {
    return env.FLIPKART_DATA_SOURCE;
  }

  supports(url: URL): boolean {
    return isFlipkartHost(url);
  }

  normalizeProductUrl(rawUrl: string): ProductIdentity {
    return normalizeFlipkartUrl(rawUrl);
  }

  protected providers(): ProductDataProvider[] {
    switch (this.dataSource) {
      case 'official':
        return [this.affiliate];
      case 'provider':
        return [this.authorized];
      case 'public':
        return [this.affiliate, this.authorized, this.publicPage];
      case 'disabled':
      default:
        return [];
    }
  }
}
