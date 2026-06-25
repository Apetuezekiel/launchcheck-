import type { LighthouseResult, Resource } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';
import { medianLighthouse } from '../lighthouse-median.js';
/**
 * Seam over the optional `lighthouse` peer dependency. The real adapter
 * dynamic-imports lighthouse + its bundled chrome-launcher, launches its own
 * headless Chrome for the audit, and kills it; tests inject a fake returning a
 * canned LighthouseResult.
 */
export interface LighthouseAdapter {
  /** Synchronous probe: is lighthouse installed and resolvable? */
  isInstalled(): boolean;
  /** Runs a Lighthouse audit against `url` (manages its own Chrome). */
  run(url: string, signal: AbortSignal): Promise<LighthouseResult>;
}
/**
 * Lighthouse audit result for the primary URL. Independent of the chrome
 * resource: the adapter launches and disposes its own Chrome per audit.
 * Unavailable when lighthouse is not installed, so the 7 lighthouse-backed
 * checkers skip cleanly.
 */
export class LighthouseResource extends BaseResource<LighthouseResult> {
  readonly name = 'lighthouse';
  private readonly url: string;
  private readonly adapter: LighthouseAdapter;
  private readonly signal: AbortSignal;
  /** Number of audit runs to median over (variance damping). Default 1. */
  private readonly runs: number;
  constructor(url: string, adapter: LighthouseAdapter, signal: AbortSignal, runs = 1) {
    super();
    this.url = url;
    this.adapter = adapter;
    this.signal = signal;
    this.runs = Math.max(1, Math.floor(runs));
  }
  protected isLocallyAvailable(): boolean {
    return this.adapter.isInstalled();
  }
  protected localUnavailableReason(): string | null {
    return this.adapter.isInstalled()
      ? null
      : 'lighthouse is not installed (optional peer dependency required for performance checks)';
  }
  dependencies(): Resource<unknown>[] {
    return [];
  }
  protected async compute(): Promise<LighthouseResult> {
    // The first run always executes; additional runs are guarded by the abort
    // signal so a cancel mid-sequence still medians whatever completed.
    const results: LighthouseResult[] = [await this.adapter.run(this.url, this.signal)];
    for (let i = 1; i < this.runs; i += 1) {
      if (this.signal.aborted) break;
      results.push(await this.adapter.run(this.url, this.signal));
    }
    return medianLighthouse(results);
  }
}
