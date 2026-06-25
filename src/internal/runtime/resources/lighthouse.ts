import type { LighthouseResult, Resource } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';
import { medianLighthouse } from '../lighthouse-median.js';
import type { ChromeBrowser, ChromeResource } from './chrome.js';

/**
 * Seam over the optional `lighthouse` peer dependency. The real adapter
 * dynamic-imports lighthouse and attaches to the shared puppeteer browser via
 * its CDP debug port; tests inject a fake returning a canned LighthouseResult.
 */
export interface LighthouseAdapter {
  /** Synchronous probe: is lighthouse installed and resolvable? */
  isInstalled(): boolean;
  /**
   * Runs a Lighthouse audit against `url`, attaching to the shared puppeteer
   * `browser` via its CDP debug port (the adapter extracts the port from the
   * browser handle). No longer self-launches Chrome.
   */
  run(browser: ChromeBrowser, url: string, signal: AbortSignal): Promise<LighthouseResult>;
}

/**
 * Lighthouse audit result for the primary URL. Depends on the shared
 * ChromeResource (Epic C): the audit attaches to the one puppeteer browser
 * instead of self-launching, removing axe/Lighthouse contention. Unavailable
 * when lighthouse is not installed OR when chrome is unavailable (e.g.
 * puppeteer absent) — in either case the 7 lighthouse-backed checkers skip
 * cleanly. NOTE behavior change: lighthouse without puppeteer now skips, since
 * it no longer launches its own Chrome.
 */
export class LighthouseResource extends BaseResource<LighthouseResult> {
  readonly name = 'lighthouse';
  private readonly url: string;
  private readonly chrome: ChromeResource;
  private readonly adapter: LighthouseAdapter;
  private readonly signal: AbortSignal;
  /** Number of audit runs to median over (variance damping). Default 1. */
  private readonly runs: number;
  constructor(
    url: string,
    chrome: ChromeResource,
    adapter: LighthouseAdapter,
    signal: AbortSignal,
    runs = 1,
  ) {
    super();
    this.url = url;
    this.chrome = chrome;
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
    return [this.chrome];
  }
  protected async compute(): Promise<LighthouseResult> {
    const browser = await this.getDependency('chrome', this.chrome);
    // The first run always executes; additional runs are guarded by the abort
    // signal so a cancel mid-sequence still medians whatever completed.
    const results: LighthouseResult[] = [await this.adapter.run(browser, this.url, this.signal)];
    for (let i = 1; i < this.runs; i += 1) {
      if (this.signal.aborted) break;
      results.push(await this.adapter.run(browser, this.url, this.signal));
    }
    return medianLighthouse(results);
  }
}
