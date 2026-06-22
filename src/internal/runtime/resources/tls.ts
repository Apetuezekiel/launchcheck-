import * as tls from 'node:tls';
import type { Resource, TlsResult } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const MS_PER_DAY = 86_400_000;

/** Inspects the TLS cert at host:port. Injectable so tests skip the network. */
export interface TlsInspector {
  inspect(host: string, port: number): Promise<TlsResult>;
}

const nodeTlsInspector: TlsInspector = {
  inspect(host, port) {
    return new Promise<TlsResult>((resolve, reject) => {
      const socket = tls.connect(
        { host, port, servername: host, rejectUnauthorized: false, timeout: DEFAULT_TIMEOUT_MS },
        () => {
          const cert = socket.getPeerCertificate();
          const authorized = socket.authorized;
          const authError = socket.authorizationError;
          const validTo = cert.valid_to ? new Date(cert.valid_to) : new Date(0);
          const validFrom = cert.valid_from ? new Date(cert.valid_from) : new Date(0);
          const daysUntilExpiry = Math.floor((validTo.getTime() - Date.now()) / MS_PER_DAY);
          resolve({
            valid: authorized,
            issuer: cert.issuer?.O ?? cert.issuer?.CN ?? '',
            subject: cert.subject?.CN ?? '',
            validFrom,
            validTo,
            daysUntilExpiry,
            protocol: socket.getProtocol() ?? '',
            errorReason: authorized ? null : authError ? String(authError) : 'untrusted',
          });
          socket.end();
        },
      );
      socket.once('error', reject);
      socket.setTimeout(DEFAULT_TIMEOUT_MS, () => {
        socket.destroy();
        reject(new Error(`TLS connection to ${host}:${port} timed out`));
      });
    });
  },
};

/**
 * TLS/SSL inspection of the primary URL's host. One handshake per run via
 * BaseResource memoization. The inspector is injectable for tests.
 */
export class TlsResource extends BaseResource<TlsResult> {
  readonly name = 'tls';
  private readonly host: string;
  private readonly port: number;
  private readonly inspector: TlsInspector;

  constructor(host: string, port: number, inspector: TlsInspector = nodeTlsInspector) {
    super();
    this.host = host;
    this.port = port;
    this.inspector = inspector;
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
  protected compute(): Promise<TlsResult> {
    return this.inspector.inspect(this.host, this.port);
  }
}
