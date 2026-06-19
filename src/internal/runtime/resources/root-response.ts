import type { HttpClient, HttpResponse, Resource } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';

/**
 * The primary URL's GET response (redirects followed). Leaf resource shared by
 * all header / redirect / compression checks. One fetch per run via
 * BaseResource memoization.
 */
export class RootResponseResource extends BaseResource<HttpResponse> {
  readonly name = 'rootResponse';
  private readonly url: string;
  private readonly http: HttpClient;

  constructor(url: string, http: HttpClient) {
    super();
    this.url = url;
    this.http = http;
  }

  protected isLocallyAvailable(): boolean {
    return true;
  }
  protected localUnavailableReason(): string | null {
    return null;
  }
  dependencies(): Resource<unknown>[] {
    return [];
  }
  protected compute(): Promise<HttpResponse> {
    return this.http.fetch(this.url, { followRedirects: true });
  }
}
