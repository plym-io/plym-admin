#!/usr/bin/env python3
"""A stand-in for the plym-cloud tenant gateway, written from its OpenAPI document.

The panel decides it is on cloud by probing `{prefix}/cloud`, and every cloud
screen is built out of that gateway — so without one, half this app cannot be
run at all. This serves `/cloud/*` itself and proxies everything else to an
ordinary plym instance, so the panel sees a single origin that looks like a
cloud deployment.

    python3 scripts/cloud-mock.py 9200 http://127.0.0.1:9173
    PLYM_API=http://127.0.0.1:9200 pnpm dev   # cloud panel
    PLYM_API=http://127.0.0.1:9173 pnpm dev   # the same build, as OSS

Settings changes are kept in memory and the operations they start play out over
a few seconds, so the deploy flow and its live log behave as they will in
production. Restart the script to reset.
"""
import json
import pathlib
import re
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9200
UPSTREAM = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:9173"

VALUES = {
    "name": "Acme Blog",
    "description": "Notes from the Acme engineering team",
    "language": "en",
    "template": "atlas",
    "logo": "/media/logo.webp",
    "favicon": "/media/favicon.png",
    "blog_prefix": "/blog",
    "colors": {"primary": "#2f6fed", "accent": "#f43d02", "background": "#ffffff", "secondary": "#6b6b6b"},
    "fonts": {"heading": "Instrument Sans", "body": "Inter"},
    "pagination": {"page_size": 10},
    "reading": {"words_per_minute": 220},
    "prism": {"enabled": True, "theme": "one-dark", "languages": "python, javascript"},
    "http_cache": {"enabled": True, "max_age": 300, "index_max_age": 60, "public": True},
    "robots": {"serve": True, "disallow_paths": ["/admin", "/cloud"]},
    "backup": {"frequency": 24},
    "media": {"location": "https://media.acme.com"},
    "mcp": {"enabled": False},
    "inject": {"head": "", "body": ""},
}

SCHEMA = [
    {"key": "name", "kind": "line", "impact": "rebuild", "effects": ["Re-renders every published post"], "note": "Shown in the header and in search results."},
    {"key": "description", "kind": "line", "impact": "rebuild", "effects": ["Re-renders every published post"]},
    {"key": "language", "kind": "line", "impact": "rebuild", "effects": []},
    {"key": "template", "kind": "enum", "impact": "rebuild", "effects": ["Re-renders every published post"], "note": "Only templates installed for this blog can be selected."},
    {"key": "logo", "kind": "url", "impact": "rebuild", "effects": []},
    {"key": "favicon", "kind": "url", "impact": "rebuild", "effects": []},
    {"key": "blog_prefix", "kind": "path", "impact": "reroute", "effects": ["Moves every published URL", "Purges the old paths from the edge"], "note": "Where the blog is mounted on your domain."},
    {"key": "colors.primary", "kind": "color", "impact": "rebuild", "effects": []},
    {"key": "colors.accent", "kind": "color", "impact": "rebuild", "effects": []},
    {"key": "colors.background", "kind": "color", "impact": "rebuild", "effects": []},
    {"key": "colors.secondary", "kind": "color", "impact": "rebuild", "effects": []},
    {"key": "fonts.heading", "kind": "line", "impact": "rebuild", "effects": []},
    {"key": "fonts.body", "kind": "line", "impact": "rebuild", "effects": []},
    {"key": "pagination.page_size", "kind": "int", "impact": "rebuild", "effects": []},
    {"key": "reading.words_per_minute", "kind": "int", "impact": "reload", "effects": ["Applies to posts created or edited afterwards"]},
    {"key": "prism.enabled", "kind": "bool", "impact": "rebuild", "effects": []},
    {"key": "prism.theme", "kind": "line", "impact": "rebuild", "effects": []},
    {"key": "prism.languages", "kind": "line", "impact": "rebuild", "effects": []},
    {"key": "http_cache.enabled", "kind": "bool", "impact": "reload", "effects": ["Restarts the blog container"]},
    {"key": "http_cache.max_age", "kind": "int", "impact": "reload", "effects": []},
    {"key": "http_cache.index_max_age", "kind": "int", "impact": "reload", "effects": []},
    {"key": "http_cache.public", "kind": "bool", "impact": "reload", "effects": []},
    {"key": "robots.serve", "kind": "bool", "impact": "rebuild", "effects": []},
    {"key": "robots.disallow_paths", "kind": "list", "impact": "rebuild", "effects": []},
    {"key": "backup.frequency", "kind": "int", "impact": "reload", "effects": []},
    {"key": "media.location", "kind": "url", "impact": "reroute", "effects": ["Rewrites every image URL"]},
    {"key": "mcp.enabled", "kind": "bool", "impact": "reload", "effects": ["Starts or stops the MCP container. No re-render."], "note": "The Model Context Protocol endpoint for this blog."},
    {"key": "inject.head", "kind": "html", "impact": "rebuild", "effects": []},
    {"key": "inject.body", "kind": "html", "impact": "rebuild", "effects": []},
]

# The v2 /templates contract: what is installed now, and what could be fetched
# from the shared repo or the tenant's own registry folder.
TEMPLATES = {
    "slug": "acme",
    "available": ["atlas", "navera"],
    "source": "overlay",
    "active": "atlas",
    "public": ["atlas", "navera", "quill", "magazine", "minimal"],
    "private": ["acme-blog-v1"],
}

CHANGES = [
    {"key": "colors.primary", "from": "#111111", "to": "#2f6fed", "at": "2026-08-01T09:14:00Z", "actor": "root@plym.local"},
    {"key": "pagination.page_size", "from": 20, "to": 10, "at": "2026-07-28T16:02:00Z", "actor": "root@plym.local"},
]

ORIGIN_HOST = "acme.plym.space"
PLATFORM_DOMAIN = "plym.space"
SLUG = "acme"

# Where the blog sits when nobody has asked for anywhere else: its own plym
# hostname, at the root of it. This is what the panel shows as "right now".
HOME = {"host": ORIGIN_HOST, "prefix": ""}

COMPOUND_SUFFIX = re.compile(r"\.(?:co|com|net|org|gov|edu|ac)\.[a-z]{2}$", re.I)


def _labels(host):
    return len(host.split(".")) - (1 if COMPOUND_SUFFIX.search(host) else 0)


def parse_home(url):
    """`?home=` as the gateway reads it: a hostname and a mount prefix."""
    from urllib.parse import urlparse
    if not url:
        return None
    parsed = urlparse(url if "//" in url else f"https://{url}")
    host = (parsed.hostname or "").lower()
    if not host:
        return None
    return {"host": host, "prefix": parsed.path.rstrip("/")}


def placement(home=None):
    """The blog's placement, or the destination when a `home` was asked for."""
    where = home or HOME
    host, prefix = where["host"], where["prefix"]
    external = not (host == PLATFORM_DOMAIN or host.endswith("." + PLATFORM_DOMAIN))
    return {
        "slug": SLUG,
        "origin_host": ORIGIN_HOST,
        "origin_url": f"https://{ORIGIN_HOST}",
        "platform_domain": PLATFORM_DOMAIN,
        "public_host": host,
        "public_url": f"https://{host}{prefix}",
        "prefix": prefix,
        "blog_home": f"https://{host}{prefix}",
        "admin_url": f"https://{host}{prefix}/plym-admin/",
        "subdomain_host": f"blog.{host}" if _labels(host) <= 2 else host,
        "at_root": prefix == "",
        "external_domain": external,
        "destination": home is not None,
    }


KINDS = [
    {"id": "path-proxy", "label": "Under a path", "summary": "Your own server forwards one folder to plym."},
    {"id": "front-door", "label": "At the edge", "summary": "Your CDN or platform rewrites the request before it reaches your app."},
    {"id": "subdomain", "label": "On a subdomain", "summary": "A DNS record points a subdomain straight at plym."},
]

CONTRACT = [
    "Forward the Host header unchanged — plym decides which blog to serve from it.",
    "Don't rewrite the path: /blog/x must arrive as /blog/x.",
    "Let plym terminate TLS on its own hostname.",
]

# id, name, category, summary, [(strategy id, kind, title, support)]
CATALOGUE = [
    ("cloudflare", "Cloudflare", "cdn", "Your domain's DNS and CDN are on Cloudflare.",
     [("worker", "front-door", "Cloudflare Worker", "supported"),
      ("subdomain", "subdomain", "Subdomain, DNS-only", "supported"),
      ("path-proxy", "path-proxy", "Origin rule", "advanced")]),
    ("fastly", "Fastly", "cdn", "Fastly sits in front of your origin.",
     [("backend", "front-door", "Second backend", "supported"),
      ("subdomain", "subdomain", "Subdomain", "supported")]),
    ("cloudfront", "AWS CloudFront", "cdn", "CloudFront distributes your site.",
     [("behavior", "front-door", "Cache behaviour", "supported"),
      ("subdomain", "subdomain", "Subdomain", "supported")]),
    ("nginx", "nginx", "web-server", "You run nginx in front of your own site.",
     [("path-proxy", "path-proxy", "Location block", "supported"),
      ("subdomain", "subdomain", "Subdomain", "supported")]),
    ("apache", "Apache", "web-server", "Apache httpd serves your site.",
     [("path-proxy", "path-proxy", "ProxyPass", "supported"),
      ("subdomain", "subdomain", "Subdomain", "supported")]),
    ("caddy", "Caddy", "web-server", "Caddy serves your site.",
     [("path-proxy", "path-proxy", "Handle block", "supported"),
      ("subdomain", "subdomain", "Subdomain", "supported")]),
    ("vercel", "Vercel", "platform", "Your marketing site is deployed on Vercel.",
     [("rewrite", "front-door", "vercel.json rewrite", "supported"),
      ("subdomain", "subdomain", "Subdomain", "supported")]),
    ("netlify", "Netlify", "platform", "Netlify builds and serves your site.",
     [("redirect", "front-door", "_redirects proxy", "supported"),
      ("subdomain", "subdomain", "Subdomain", "supported")]),
    ("shopify", "Shopify", "ecommerce", "Your storefront runs on Shopify.",
     [("subdomain", "subdomain", "Subdomain", "supported"),
      ("path-proxy", "path-proxy", "App proxy", "not-recommended")]),
    ("webflow", "Webflow", "site-builder", "Your site is built in Webflow.",
     [("subdomain", "subdomain", "Subdomain", "supported")]),
    ("squarespace", "Squarespace", "site-builder", "Squarespace hosts your site.",
     [("subdomain", "subdomain", "Subdomain", "supported")]),
    ("wordpress", "WordPress", "site-builder", "A WordPress install serves your domain.",
     [("subdomain", "subdomain", "Subdomain", "supported"),
      ("path-proxy", "path-proxy", "Reverse proxy", "advanced")]),
]

DOCS = {
    "cloudflare": [{"title": "Cloudflare Workers routes", "url": "https://developers.cloudflare.com/workers/configuration/routing/"}],
    "nginx": [{"title": "nginx proxy_pass", "url": "https://nginx.org/en/docs/http/ngx_http_proxy_module.html"}],
    "vercel": [{"title": "Vercel rewrites", "url": "https://vercel.com/docs/edge-network/rewrites"}],
}

STRATEGY_SUMMARY = {
    "path-proxy": "Your server keeps serving the site and quietly forwards one folder to plym.",
    "front-door": "Your CDN answers as usual and sends just the blog's requests to plym.",
    "subdomain": "One DNS record. Nothing in front of it, so there is nothing to keep in sync.",
}


def _blocked(kind, dest):
    """Why a way of connecting cannot serve the address the owner asked for."""
    if kind in ("path-proxy",) and not dest["prefix"]:
        return "That address has no path, so there is nothing for a proxy to match. Use a subdomain instead."
    if kind == "subdomain" and _labels(dest["public_host"]) <= 2:
        return f"That is the domain itself, not a subdomain. Try blog.{dest['public_host']}."
    if kind == "subdomain" and dest["prefix"]:
        return "A subdomain serves the whole host, so it cannot live under a path."
    return None


def _steps(gid, sid, kind, dest):
    """The owner's work, rendered against the real hosts. Never plym's."""
    host, prefix = dest["public_host"], dest["prefix"]
    up = ORIGIN_HOST
    if kind == "subdomain":
        return [{
            "actor": "customer",
            "title": f"Add a CNAME record for {host}",
            "detail": ("At your DNS provider." if gid != "cloudflare"
                       else "In the Cloudflare DNS tab. Set the proxy status to DNS only — the grey cloud — so plym can issue the certificate."),
            "snippet": {"label": "DNS record", "language": "dns", "filename": None,
                        "body": f"{host}.\tCNAME\t{up}."},
        }]
    if gid == "nginx":
        return [
            {"actor": "customer", "title": "Add a location block",
             "detail": f"Inside the server block that already answers for {host}.",
             "snippet": {"label": "nginx", "language": "nginx", "filename": f"/etc/nginx/sites-enabled/{host}",
                         "body": f"location {prefix}/ {{\n    proxy_pass https://{up}{prefix}/;\n    proxy_set_header Host {up};\n    proxy_ssl_server_name on;\n}}"}},
            {"actor": "customer", "title": "Test the config and reload",
             "detail": "Reloading is graceful — no requests are dropped.",
             "snippet": {"label": "Shell", "language": "shell", "filename": None,
                         "body": "sudo nginx -t && sudo nginx -s reload"}},
        ]
    if gid == "apache":
        return [
            {"actor": "customer", "title": "Add a ProxyPass",
             "detail": f"In the VirtualHost for {host}. mod_proxy and mod_proxy_http must be enabled.",
             "snippet": {"label": "Apache", "language": "apache", "filename": f"/etc/apache2/sites-enabled/{host}.conf",
                         "body": f"SSLProxyEngine on\nProxyPreserveHost Off\nProxyPass {prefix}/ https://{up}{prefix}/\nProxyPassReverse {prefix}/ https://{up}{prefix}/"}},
            {"actor": "customer", "title": "Reload Apache",
             "snippet": {"label": "Shell", "language": "shell", "filename": None,
                         "body": "sudo apachectl configtest && sudo systemctl reload apache2"}},
        ]
    if gid == "caddy":
        return [
            {"actor": "customer", "title": "Add a handle block",
             "snippet": {"label": "Caddyfile", "language": "caddy", "filename": "/etc/caddy/Caddyfile",
                         "body": f"{host} {{\n    handle {prefix}/* {{\n        reverse_proxy https://{up} {{\n            header_up Host {up}\n        }}\n    }}\n}}"}},
            {"actor": "customer", "title": "Reload Caddy",
             "snippet": {"label": "Shell", "language": "shell", "filename": None,
                         "body": "sudo caddy reload --config /etc/caddy/Caddyfile"}},
        ]
    if gid == "cloudflare":
        if sid == "worker":
            return [
                {"actor": "customer", "title": "Create a Worker",
                 "detail": "Workers & Pages → Create → Worker. Paste this as its code.",
                 "snippet": {"label": "Worker", "language": "javascript", "filename": "worker.js",
                             "body": f"export default {{\n  async fetch(request) {{\n    const url = new URL(request.url);\n    url.hostname = '{up}';\n    return fetch(url, {{ ...request, headers: request.headers }});\n  }},\n}};"}},
                {"actor": "customer", "title": "Route your blog path to it",
                 "detail": f"Under the Worker's Settings → Domains & Routes, add the route below.",
                 "snippet": {"label": "Route", "language": "text", "filename": None,
                             "body": f"{host}{prefix}/*"}},
            ]
        return [
            {"actor": "customer", "title": "Add an origin rule",
             "detail": f"Rules → Origin Rules → Create. Match the path and override the host.",
             "snippet": {"label": "Expression", "language": "text", "filename": None,
                         "body": f'(http.host eq "{host}" and starts_with(http.request.uri.path, "{prefix}"))\n→ Host header: {up}'}},
        ]
    if gid == "vercel":
        return [
            {"actor": "customer", "title": "Add a rewrite",
             "detail": "In the project root, next to your package.json.",
             "snippet": {"label": "JSON", "language": "json", "filename": "vercel.json",
                         "body": '{\n  "rewrites": [\n    {\n      "source": "%s/:path*",\n      "destination": "https://%s%s/:path*"\n    }\n  ]\n}' % (prefix, up, prefix)}},
            {"actor": "customer", "title": "Deploy it",
             "snippet": {"label": "Shell", "language": "shell", "filename": None, "body": "vercel --prod"}},
        ]
    if gid == "netlify":
        return [
            {"actor": "customer", "title": "Add a proxy redirect",
             "detail": "The 200 status is what makes it a proxy rather than a redirect.",
             "snippet": {"label": "Redirects", "language": "text", "filename": "public/_redirects",
                         "body": f"{prefix}/*  https://{up}{prefix}/:splat  200"}},
            {"actor": "customer", "title": "Deploy the site"},
        ]
    if gid in ("fastly", "cloudfront"):
        noun = "backend" if gid == "fastly" else "origin"
        return [
            {"actor": "customer", "title": f"Add plym as a {noun}",
             "detail": f"Point it at {up} over HTTPS, and override the Host header to the same value.",
             "snippet": {"label": "Origin", "language": "text", "filename": None,
                         "body": f"host: {up}\nport: 443\ntls: on\noverride host: {up}"}},
            {"actor": "customer", "title": f"Send {prefix}/* to it",
             "detail": f"Match the path prefix {prefix} and route it to the new {noun}."},
        ]
    return [
        {"actor": "customer", "title": f"Forward {prefix}/ to plym",
         "detail": f"However your platform proxies a path, send it to {up} with the Host header set to {up}.",
         "snippet": {"label": "Upstream", "language": "text", "filename": None,
                     "body": f"https://{up}{prefix}/"}},
    ]


def _platform(kind):
    if kind == "subdomain":
        return [{"actor": "plym", "title": "Register the hostname and order its certificate",
                 "detail": "in the same step, as soon as you press the button below"}]
    return [{"actor": "plym", "title": "Re-render every page for the new address",
             "detail": "canonical tags and sitemap included"}]


def _checks(dest):
    url = f"https://{dest['public_host']}{dest['prefix']}"
    checks = [{"title": "The blog answers on your domain",
               "command": f"curl -sI {url}/ | head -1", "expect": "HTTP/2 200"}]
    if not dest["prefix"]:
        checks.insert(0, {"title": "DNS points at plym",
                          "command": f"dig +short {dest['public_host']}",
                          "expect": f"{ORIGIN_HOST}."})
    return checks


CAVEATS = {
    "path-proxy": ["Your CDN may cache the blog — set a max-age you are happy with.",
                   "Every published URL keeps the path you chose."],
    "front-door": ["Requests take one extra hop through your edge."],
    "subdomain": ["Readers see the subdomain, not a folder on your main site."],
}

REQUIRES = {
    "subdomain": ["Permission to add a DNS record for the domain"],
    "path-proxy": ["Access to the configuration of whatever serves the domain today",
                   "Somewhere to reload it once you have saved"],
    "front-door": ["An account with edit rights on the edge configuration"],
}


def strategies_for(gid, kinds, dest, wanted=None, full=False):
    out = []
    for sid, kind, title, support in kinds:
        if wanted and sid != wanted:
            continue
        blocked = _blocked(kind, dest)
        entry = {"id": sid, "kind": kind, "title": title, "support": support,
                 "summary": STRATEGY_SUMMARY[kind],
                 "applicable": blocked is None, "blocked_reason": blocked}
        if full:
            register = kind == "subdomain"
            entry.update({
                "steps": _steps(gid, sid, kind, dest) if blocked is None else [],
                "platform": _platform(kind) if blocked is None else [],
                "finish": None if blocked else {
                    "title": "Ready when you are",
                    "detail": "Once your change is saved, this moves the blog and rewrites every URL for the new address.",
                    "home": f"https://{dest['public_host']}{dest['prefix']}",
                    "register_hostname": register,
                },
                "checks": _checks(dest) if blocked is None else [],
                "requires": REQUIRES[kind] if blocked is None else [],
                "caveats": CAVEATS[kind] if blocked is None else [],
                "docs": DOCS.get(gid, []),
                "register_hostname": register,
            })
        out.append(entry)
    return out


def routing_options(dest):
    gateways = []
    for gid, name, category, summary, kinds in CATALOGUE:
        strategies = strategies_for(gid, kinds, dest)
        gateways.append({"id": gid, "name": name, "category": category, "summary": summary,
                         "applicable": any(s["applicable"] for s in strategies),
                         "strategies": strategies, "docs": DOCS.get(gid, [])})
    pick = "nginx" if dest["prefix"] else "cloudflare"
    why = ("Most sites that serve a folder already have a web server doing it — start here if you run your own."
           if dest["prefix"] else
           "A subdomain needs one DNS record and nothing else, and most domains have their DNS here.")
    strategy = "path-proxy" if dest["prefix"] else "subdomain"
    return {"placement": dest, "kinds": KINDS,
            "recommended": {"gateway": pick, "strategy": strategy, "why": why},
            "gateways": gateways}


OPS = {}
OPS_LOCK = threading.Lock()

EVENT_SCRIPT = {
    "rebuild": [
        (0.0, "info", "Validating the settings document"),
        (0.8, "info", "Writing config.yaml"),
        (1.6, "info", "Recreating the blog container"),
        (2.6, "warn", "Container took 2.1s to become healthy"),
        (3.4, "info", "Re-rendering 12 published posts"),
        (4.4, "done", "Applied 1 change. The blog is live."),
    ],
    "home": [
        (0.0, "info", "Validating the destination"),
        (0.7, "info", "Registering the hostname on the edge"),
        (1.6, "info", "Ordering the TLS certificate"),
        (2.5, "info", "Re-rendering 12 published posts for the new address"),
        (3.6, "info", "Purging the CDN"),
        (4.4, "done", "Your blog now answers on its new address."),
    ],
    "template": [
        (0.0, "info", "Resolving the template from the registry"),
        (0.9, "info", "Fetching templates/ at ref main"),
        (2.0, "info", "Writing the overlay"),
        (3.0, "info", "Recreating the blog container"),
        (4.0, "info", "Re-rendering 12 published posts"),
        (4.8, "done", "Template installed. Select it to make it live."),
    ],
    "reload": [
        (0.0, "info", "Validating the settings document"),
        (0.6, "info", "Re-applying config.yaml"),
        (1.4, "info", "Reloading the blog"),
        (2.2, "done", "Applied. Nothing needed re-rendering."),
    ],
}


def start_op(verb, kind="rebuild"):
    op_id = f"20260803-{int(time.time()) % 100000}-{verb}-acme"
    with OPS_LOCK:
        OPS[op_id] = {"op_id": op_id, "verb": verb, "target": "acme", "started": time.time(), "kind": kind}
    return OPS[op_id]


def op_page(op_id, after):
    op = OPS.get(op_id)
    if not op:
        return None
    elapsed = time.time() - op["started"]
    script = EVENT_SCRIPT[op["kind"]]
    due = [(i, e) for i, e in enumerate(script) if e[0] <= elapsed]
    events = [{"seq": i + 1, "level": e[1], "message": e[2]} for i, e in due if i + 1 > after]
    state = "succeeded" if len(due) == len(script) else ("running" if due else "queued")
    return {"op_id": op_id, "events": events, "next_after": len(due), "state": state}


def flat(values, prefix=""):
    out = {}
    for k, v in values.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flat(v, key))
        else:
            out[key] = v
    return out


def set_flat(key, value):
    parts = key.split(".")
    node = VALUES
    for p in parts[:-1]:
        node = node.setdefault(p, {})
    node[parts[-1]] = value


def impact_of(keys):
    order = ["none", "reload", "rebuild", "reroute"]
    worst = "none"
    by_key = {f["key"]: f.get("impact", "reload") for f in SCHEMA}
    for k in keys:
        i = by_key.get(k, "reload")
        if order.index(i) > order.index(worst):
            worst = i
    return worst


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cloud(self, method, path, query, body):
        if path == "/capabilities":
            return 200, {"settings": True, "routing": True, "mcp": True, "analytics": True, "ops": True}
        if path == "/health":
            return 200, {"ok": True}
        if not self.headers.get("Authorization", "").startswith("Bearer "):
            return 401, {"kind": "unauthenticated", "error": "unauthenticated",
                         "message": "No bearer token.", "remedy": "Sign in again."}
        if path == "/settings" and method == "GET":
            return 200, {"values": VALUES, "schema": SCHEMA, "templates": TEMPLATES}
        if path == "/settings" and method == "PUT":
            keys = list(body.keys())
            kind = "rebuild" if impact_of(keys) in ("rebuild", "reroute") else "reload"
            op = start_op("settings", kind)
            for k, v in body.items():
                set_flat(k, v)
                CHANGES.insert(0, {"key": k, "to": v, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                   "actor": "root@plym.local"})
            return 202, {"op_id": op["op_id"], "verb": "settings", "target": "acme", "state": "queued"}
        if path == "/settings/plan":
            current = flat(VALUES)
            changes = [{"key": k, "from": current.get(k), "to": v} for k, v in body.items()]
            impact = impact_of(body.keys())
            effects = sorted({e for f in SCHEMA if f["key"] in body for e in f.get("effects", [])})
            return 200, {"changes": changes, "effects": effects, "impact": impact}
        if path == "/settings/changes":
            return 200, CHANGES[:int(query.get("limit", ["50"])[0])]
        if path == "/status":
            here = placement()
            return 200, {"url": here["public_url"], "prefix": here["prefix"], "running": True,
                         "state": "healthy", "image": "plymio/plym:1.2.0", "admin_version": "1.1.0"}
        if path == "/templates" and method == "GET":
            return 200, dict(TEMPLATES, active=flat(VALUES).get("template"))
        if path == "/templates" and method == "POST":
            name = body.get("name")
            source = body.get("source", "public")
            if source not in ("public", "private"):
                return 422, {"kind": "invalid", "error": "invalid",
                             "message": f"Unknown source {source!r}.",
                             "remedy": "Use \"public\" or \"private\"."}
            offered = TEMPLATES[source]
            if name not in offered:
                return 404, {"kind": "not_found", "error": "not_found",
                             "message": f"No template named {name!r} in the {source} registry.",
                             "remedy": "Pick a name from the list."}
            if name in TEMPLATES["available"] and not body.get("update"):
                return 409, {"kind": "conflict", "error": "conflict",
                             "message": f"{name} is already installed.",
                             "remedy": "Pass update: true to refetch it."}
            op = start_op("template", "template")
            # Installing restarts the blog, so it lands only when the op does.
            threading.Timer(
                5.0,
                lambda: TEMPLATES["available"].append(name)
                if name not in TEMPLATES["available"] else None,
            ).start()
            return 202, {"op_id": op["op_id"], "verb": "template", "target": name, "state": "queued"}
        if path == "/gateways":
            return 200, {"gateways": routing_options(placement())["gateways"], "kinds": KINDS,
                         "example": placement(parse_home("https://www.example.com/blog")),
                         "contract": CONTRACT}
        if path == "/home" and method == "PUT":
            url = body.get("url")
            home = parse_home(url)
            if not home:
                return 422, {"kind": "invalid", "error": "invalid",
                             "message": "That is not an address plym can serve from.",
                             "remedy": "Pass a full https:// URL."}
            op = start_op("home", "home")
            globals()["HOME"] = home
            return 202, {"op_id": op["op_id"], "verb": "home", "target": SLUG, "state": "queued"}
        if path == "/routing":
            dest = placement(parse_home(query.get("home", [None])[0]))
            return 200, routing_options(dest)
        m = re.fullmatch(r"/routing/([\w-]+)", path)
        if m:
            gid = m.group(1)
            entry = next((g for g in CATALOGUE if g[0] == gid), None)
            if not entry:
                return 404, {"kind": "not_found", "error": "not_found", "message": f"No guide for {gid}."}
            _, name, category, summary, kinds = entry
            dest = placement(parse_home(query.get("home", [None])[0]))
            wanted = query.get("strategy", [None])[0]
            return 200, {
                "placement": dest,
                "gateway": {"id": gid, "name": name, "category": category, "summary": summary,
                            "docs": DOCS.get(gid, [])},
                "contract": CONTRACT,
                "strategies": strategies_for(gid, kinds, dest, wanted, full=True),
            }
        m = re.fullmatch(r"/ops/([\w-]+)/events", path)
        if m:
            page = op_page(m.group(1), int(query.get("after", ["0"])[0]))
            return (200, page) if page else (404, {"kind": "not_found", "error": "not_found",
                                                   "message": "Unknown operation."})
        m = re.fullmatch(r"/ops/([\w-]+)", path)
        if m:
            page = op_page(m.group(1), 0)
            return (200, page) if page else (404, {"kind": "not_found", "error": "not_found",
                                                   "message": "Unknown operation."})
        if path == "/ops":
            return 200, []
        return 404, {"kind": "not_found", "error": "not_found", "message": f"No route {path}."}

    def _proxy(self):
        url = UPSTREAM + self.path
        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else None
        req = urllib.request.Request(url, data=payload, method=self.command)
        for k, v in self.headers.items():
            if k.lower() not in ("host", "content-length", "connection", "accept-encoding"):
                req.add_header(k, v)
        try:
            with urllib.request.urlopen(req) as res:
                body = res.read()
                self.send_response(res.status)
                for k, v in res.headers.items():
                    if k.lower() not in ("transfer-encoding", "content-length", "connection", "content-encoding"):
                        self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:  # upstream down
            self._send(502, {"detail": str(e)})

    def _handle(self):
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.path)
        # plym only publishes its OpenAPI document in debug mode, so a stock
        # sandbox 404s it and the panel's API screen has nothing to render.
        # Serve the repo's checked-in snapshot here so that screen is drivable
        # locally without putting the shared sandbox into debug.
        if parsed.path in ("/api/openapi.json", "/openapi.json"):
            spec = pathlib.Path(__file__).resolve().parent.parent / "openapi.json"
            if spec.exists():
                body = spec.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        if parsed.path.startswith("/cloud"):
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                body = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                body = {}
            status, payload = self._cloud(self.command, parsed.path[len("/cloud"):] or "/",
                                          parse_qs(parsed.query), body)
            self._send(status, payload)
        else:
            self._proxy()

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _handle


if __name__ == "__main__":
    print(f"plym-cloud mock on :{PORT}, proxying to {UPSTREAM}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
