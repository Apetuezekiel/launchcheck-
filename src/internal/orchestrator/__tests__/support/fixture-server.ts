import { type Server, createServer } from 'node:http';

/** A single canned response for a path. */
export interface RouteResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  /** Optional delay before responding, to exercise timeouts. */
  delayMs?: number;
}

export interface FixtureOptions {
  /** pathname -> response. Matched against the request's URL pathname. */
  routes?: Record<string, RouteResponse>;
  /** Response for unmatched paths. Defaults to 404. */
  fallback?: RouteResponse;
}

export interface Fixture {
  /** Base URL, e.g. http://127.0.0.1:54321/ */
  url: string;
  close: () => Promise<void>;
}

/**
 * Minimal configurable HTTP server for integration tests. Lets the real
 * DefaultHttpClient + DomResource + checkers run end-to-end against controllable
 * headers / bodies / statuses with zero mocks and zero external network.
 */
export async function startFixture(opts: FixtureOptions = {}): Promise<Fixture> {
  const routes = opts.routes ?? {};
  const fallback = opts.fallback ?? { status: 404, body: 'not found' };

  const server: Server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const route = routes[pathname] ?? fallback;
    const send = (): void => {
      res.statusCode = route.status ?? 200;
      for (const [k, v] of Object.entries(route.headers ?? {})) {
        res.setHeader(k, v);
      }
      res.end(route.body ?? '');
    };
    if (route.delayMs && route.delayMs > 0) {
      setTimeout(send, route.delayMs);
    } else {
      send();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('fixture server failed to bind a TCP port');
  }
  return {
    url: `http://127.0.0.1:${addr.port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

/** A well-formed HTML document that passes the SEO/DOM checkers. */
export const GOOD_HTML = `<!doctype html>
<html lang="en">
<head>
  <title>Acme — Pre-launch QA for the modern web</title>
  <meta name="description" content="Acme runs automated pre-launch checks across security, SEO, performance, and accessibility so you ship with confidence.">
  <link rel="canonical" href="http://127.0.0.1/">
  <link rel="icon" href="/favicon.ico">
  <meta property="og:title" content="Acme">
  <meta property="og:description" content="Pre-launch QA.">
  <meta property="og:image" content="http://127.0.0.1/og.png">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Acme">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Acme"}</script>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <h1>Acme</h1>
  <h2>Features</h2>
  <script src="/app.js"></script>
</body>
</html>`;

/** A bare document that fails most SEO/DOM checkers. */
export const BAD_HTML = '<!doctype html><html><head></head><body><p>hi</p></body></html>';
