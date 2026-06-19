import type { HttpResponse, ParsedDom, Resource } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';
import { parseDom } from '../parse-dom.js';

/**
 * Parsed DOM of the primary URL's response body. Depends on rootResponse;
 * one parse per run via BaseResource memoization. When rootResponse fails,
 * this resource short-circuits with a dependency-failed error and consuming
 * checkers skip.
 */
export class DomResource extends BaseResource<ParsedDom> {
  readonly name = 'dom';
  private readonly rootResponse: Resource<HttpResponse>;

  constructor(rootResponse: Resource<HttpResponse>) {
    super();
    this.rootResponse = rootResponse;
  }

  protected isLocallyAvailable(): boolean {
    return true;
  }
  protected localUnavailableReason(): string | null {
    return null;
  }
  dependencies(): Resource<unknown>[] {
    return [this.rootResponse];
  }
  protected async compute(): Promise<ParsedDom> {
    const response = await this.getDependency('rootResponse', this.rootResponse);
    return parseDom(response.body);
  }
}
