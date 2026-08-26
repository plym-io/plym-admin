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
 *
 * Parsing is all it does. Whether an address is an apex, whether it can hold a
 * CNAME, which strategies it rules out — those are the gateway's answers, and
 * they arrive on `placement` (`at_apex`, `subdomain_requested`) as soon as
 * `getRouting()` returns. Deciding them a second time here is how the two
 * implementations drift apart, so `shape` below is only ever a hint for the
 * copy shown *while someone is still typing*. Nothing acted on comes from it.
 */

/** The rough shape of what was typed. A hint for pre-flight copy, not a ruling. */
export type DestinationShape = 'subdomain' | 'path' | 'root';

export interface Destination {
  /** Normalized absolute URL — this is what goes on the wire as `?home=`. */
  url: string;
  host: string;
  /** Mount path with no trailing slash; an empty string at the domain root. */
  prefix: string;
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
      shape,
    },
  };
}

/**
 * One line of plain language reading back what was typed, shown while they are
 * still typing it.
 *
 * This is a preview, not a verdict. It says what the address *is*; it does not
 * promise the blog can be served there, because at this point nothing has asked
 * the gateway. A bare domain in particular cannot hold a CNAME and will be
 * turned down — so the line stops at describing the address and hands the
 * question to the next step, where `placement.at_apex` and `recommended.why`
 * answer it properly.
 */
export function describeDestination(d: Destination): string {
  if (d.shape === 'path') {
    return `A section of ${d.host}, at ${d.prefix}.`;
  }
  if (d.shape === 'subdomain') {
    return 'A subdomain, separate from your main site.';
  }
  return `The whole of ${d.host}, with nothing in front of it — the next step says what that address can do.`;
}

/**
 * Roughly what the owner will have to be able to change. Both branches are true
 * of the address either way round, which is why this is safe to say before
 * asking; the gateway lists the actual specifics per strategy.
 */
export function destinationRequirement(d: Destination): string {
  return d.shape === 'path'
    ? 'You will need to add a rule to whatever serves that domain today.'
    : 'You will need to add a DNS record for it.';
}
