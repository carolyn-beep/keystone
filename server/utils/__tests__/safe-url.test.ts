import { describe, it, expect } from 'vitest';
import { assertPublicHttpUrl, isBlockedHostname, isPrivateAddress } from '../safe-url';

describe('isPrivateAddress', () => {
  it('flags loopback, link-local, RFC1918 and CGNAT ranges', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('flags IPv6 loopback, link-local, ULA and mapped private IPv4', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe('isBlockedHostname', () => {
  it('blocks localhost and internal suffixes', () => {
    for (const h of ['localhost', 'LOCALHOST', 'foo.localhost', 'db.internal', 'printer.local', 'metadata.google.internal', 'metadata']) {
      expect(isBlockedHostname(h), h).toBe(true);
    }
  });

  it('blocks literal private IPs and allows public names', () => {
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
    expect(isBlockedHostname('[::1]')).toBe(true);
    expect(isBlockedHostname('example.com')).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it('rejects non-http schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(/http/);
    await expect(assertPublicHttpUrl('ftp://example.com/x')).rejects.toThrow(/http/);
  });

  it('rejects malformed URLs', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(/Invalid/);
  });

  it('rejects private literal hosts without touching DNS', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/cannot be fetched/);
    await expect(assertPublicHttpUrl('http://127.0.0.1:5432/')).rejects.toThrow(/cannot be fetched/);
    await expect(assertPublicHttpUrl('http://localhost/admin')).rejects.toThrow(/cannot be fetched/);
    await expect(assertPublicHttpUrl('http://10.0.0.1/?x=workflowy.com/s/abc')).rejects.toThrow(/cannot be fetched/);
  });

  it('accepts a public literal IP without DNS', async () => {
    const url = await assertPublicHttpUrl('https://1.1.1.1/');
    expect(url.hostname).toBe('1.1.1.1');
  });

  it('accepts RFC 2606 reserved documentation hosts without DNS', async () => {
    for (const u of ['https://alt.example/article', 'https://example.com/x', 'https://docs.example.org/y', 'http://foo.test/']) {
      const url = await assertPublicHttpUrl(u);
      expect(url.href).toBe(u);
    }
  });
});
