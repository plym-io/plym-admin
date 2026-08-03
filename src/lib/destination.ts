/**
 * Where the owner wants their blog to live.
 *
 * This is the first thing the connect-your-domain screen asks, and everything
 * downstream is rendered against the answer: the gateway sends it back as
 * `?home=` and returns steps, snippets and applicability for *that* address
 * rather than for the plym hostname the blog sits on today.
 *
 * The parsing here is deliberately forgiving — people type `blog.acme.com`,
 * not `https://blog.acme.com/`. It only refuses input the gateway could not
 * act on, and every refusal says what to do instead.
 */

/** The two shapes a blog can take on someone's own domain. */
export type DestinationShape = 'subdomain' | 'path' | 'root';

export interface Destination {
  /** Normalized absolute URL — this is what goes on the wire as `?home=`. */
  url: string;
  host: string;
  /** Mount path with no trailing slash; an empty string at the domain root. */
  prefix: string;
  /** The registrable-looking part of the host, for copy: `acme.com`. */
  domain: string;
  shape: DestinationShape;
}

export type ParsedDestination =
  | { ok: true; value: Destination }
  | { ok: false; message: string };

/** Hosts that are a `www` away from being the domain itself. */
const BARE_PREFIXES = new Set(['www']);

/**
 * The label count that makes a host a subdomain rather than the domain itself.
 * Two-part public suffixes (`acme.co.uk`) would otherwise read as subdomains,
 * so they are counted as one label.
 */
const COMPOUND_SUFFIX =
  /\.(?:co|com|net|org|gov|edu|ac|or|ne|in|go)\.[a-z]{2}$/i;

function labelCount(host: string): number {
  const compound = COMPOUND_SUFFIX.test(host);
  const labels = host.split('.').length;
  return compound ? labels - 1 : labels;
}

/** `blog.acme.com` → `acme.com`; `www.acme.co.uk` → `acme.co.uk`. */
function registrable(host: string): string {
  const keep = COMPOUND_SUFFIX.test(host) ? 3 : 2;
  const labels = host.split('.');
  return labels.slice(Math.max(0, labels.length - keep)).join('.');
}

export function parseDestination(input: string, platformDomain?: string): ParsedDestination {
  const raw = input.trim();
  if (!raw) return { ok: false, message: 'Enter the address you want your blog to have.' };
  if (/\s/.test(raw)) return { ok: false, message: "An address can't contain spaces." };

  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    return { ok: false, message: 'Use a web address starting with https://.' };
  }

  let url: URL;
  try {
    url = new URL(scheme ? raw : `https://${raw}`);
  } catch {
    return { ok: false, message: "That doesn't look like a web address." };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host.endsWith('.')) {
    return {
      ok: false,
      message: 'Include the whole domain — blog.acme.com, or acme.com/blog.',
    };
  }
  if (!/^[a-z0-9.-]+$/.test(host) || /(^|\.)-|-(\.|$)/.test(host)) {
    return { ok: false, message: "That hostname isn't valid." };
  }
  if (/^\d+(\.\d+)*$/.test(host)) {
    return { ok: false, message: 'Use a domain name rather than an IP address.' };
  }
  if (host === 'localhost' || host.endsWith('.local')) {
    return { ok: false, message: 'Use a domain the public internet can reach.' };
  }
  if (platformDomain && (host === platformDomain || host.endsWith(`.${platformDomain}`))) {
    return {
      ok: false,
      message: `That's the address plym already gives you. Enter a domain you own — blog.acme.com, or acme.com/blog.`,
    };
  }

  // Query strings and fragments are noise on a mount point, not an error.
  const prefix = url.pathname.replace(/\/+$/, '');
  if (prefix && !/^(\/[A-Za-z0-9._~-]+)+$/.test(prefix)) {
    return { ok: false, message: 'Use a simple path, like /blog.' };
  }

  const shape: DestinationShape = prefix
    ? 'path'
    : labelCount(host) > 2 && !BARE_PREFIXES.has(host.split('.')[0])
      ? 'subdomain'
      : 'root';

  return {
    ok: true,
    value: {
      url: `https://${host}${prefix}`,
      host,
      prefix,
      domain: registrable(host),
      shape,
    },
  };
}

/** One line of plain language confirming what was typed. */
export function describeDestination(d: Destination): string {
  if (d.shape === 'path') {
    return `A section of ${d.host}, at ${d.prefix} — the rest of the site stays exactly as it is.`;
  }
  if (d.shape === 'subdomain') {
    return `A subdomain of ${d.domain}, separate from your main site.`;
  }
  return `The whole of ${d.host} — the blog becomes that site's homepage.`;
}

/**
 * What the owner has to be able to change to make it work. The gateway lists
 * the specifics per strategy; this sets expectations before they pick one.
 */
export function destinationRequirement(d: Destination): string {
  return d.shape === 'path'
    ? 'You will need to add a rule to whatever serves that domain today.'
    : 'You will need to add a DNS record for it.';
}
