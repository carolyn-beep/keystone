/**
 * Guard for server-side fetches of user-supplied URLs (fact sources, imported
 * documents, author lookups). Rejects anything that is not public http(s):
 * non-http schemes, localhost / internal hostnames, and hosts that resolve to
 * loopback, link-local (cloud metadata), or RFC1918 private ranges.
 *
 * This checks the address at request time; a redirect from a public host to a
 * private one is not re-checked, so callers that follow redirects should keep
 * redirect counts low.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal'];

// RFC 2606 / IANA reserved names can never point at private infrastructure
// (they either do not resolve at all or resolve to IANA's public hosts), so
// they skip the DNS step. This keeps offline unit tests that use *.example
// hosts working without a test-only escape hatch.
const RESERVED_DOC_HOSTS = new Set(['example.com', 'example.net', 'example.org']);
const RESERVED_DOC_SUFFIXES = ['.example', '.test', '.invalid', '.example.com', '.example.net', '.example.org'];

function isReservedDocumentationHost(host: string): boolean {
  return RESERVED_DOC_HOSTS.has(host) || RESERVED_DOC_SUFFIXES.some((s) => host.endsWith(s));
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.slice('::ffff:'.length));
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (isIP(host)) return isPrivateAddress(host);
  return false;
}

/**
 * Parse and validate a URL for server-side fetching. Resolves DNS for
 * hostnames and rejects any that map to a private or special-use address.
 * Throws an Error with a short, user-safe message on rejection.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) URLs can be fetched');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(host)) {
    throw new Error('This host cannot be fetched');
  }

  if (!isIP(host) && !isReservedDocumentationHost(host.toLowerCase())) {
    let addresses: { address: string }[];
    try {
      addresses = await lookup(host, { all: true });
    } catch {
      throw new Error('Host could not be resolved');
    }
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      throw new Error('This host cannot be fetched');
    }
  }

  return url;
}
