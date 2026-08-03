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

TEMPLATES = {"installed": ["atlas", "navera"], "available": ["atlas", "navera", "quill"]}

CHANGES = [
    {"key": "colors.primary", "from": "#111111", "to": "#2f6fed", "at": "2026-08-01T09:14:00Z", "actor": "root@plym.local"},
    {"key": "pagination.page_size", "from": 20, "to": 10, "at": "2026-07-28T16:02:00Z", "actor": "root@plym.local"},
]

GATEWAYS = [
    {
        "id": "cloudflare",
        "label": "Cloudflare",
        "description": "Your domain's DNS and CDN are on Cloudflare.",
        "strategies": [
            {"id": "worker", "label": "Worker", "applicable": True, "recommended": True, "support": "native",
             "summary": "A Worker on client.com forwards /blog to your plym blog."},
            {"id": "subdomain", "label": "Subdomain", "applicable": True, "support": "best",
             "summary": "blog.client.com points straight at plym — the simplest option."},
            {"id": "path-proxy", "label": "Path proxy", "applicable": False,
             "blocked_reason": "Cloudflare cannot proxy a path without a Worker on the paid plan."},
        ],
    },
    {
        "id": "nginx",
        "label": "nginx",
        "description": "You run nginx in front of your own site.",
        "strategies": [
            {"id": "path-proxy", "label": "Path proxy", "applicable": True, "recommended": True, "support": "best",
             "summary": "nginx forwards client.com/blog to your plym blog."},
            {"id": "subdomain", "label": "Subdomain", "applicable": True, "support": "native",
             "summary": "blog.client.com resolves to plym directly, bypassing nginx."},
        ],
    },
    {"id": "vercel", "label": "Vercel", "description": "Your marketing site is deployed on Vercel.",
     "strategies": [{"id": "rewrite", "label": "Rewrite", "applicable": True, "recommended": True,
                     "summary": "A rewrite in vercel.json sends /blog to plym."}]},
    {"id": "shopify", "label": "Shopify", "description": "Your storefront runs on Shopify.",
     "strategies": [{"id": "subdomain", "label": "Subdomain", "applicable": True, "recommended": True,
                     "summary": "Shopify cannot proxy a path, so the blog lives on a subdomain."}]},
]

PLACEMENT = {"host": "client.com", "prefix": "/blog", "url": "https://client.com/blog"}

STEPS = {
    ("nginx", "path-proxy"): [
        {"actor": "customer", "title": "Add a location block", "body": "Inside the server block for client.com.",
         "snippet": "location /blog/ {\n    proxy_pass https://acme.plym.app/blog/;\n    proxy_set_header Host acme.plym.app;\n    proxy_ssl_server_name on;\n}"},
        {"actor": "customer", "title": "Reload nginx", "snippet": "sudo nginx -t && sudo nginx -s reload"},
        {"actor": "plym", "title": "We issue the certificate", "body": "Nothing for you to do — this happens within a minute of the first request."},
    ],
    ("nginx", "subdomain"): [
        {"actor": "customer", "title": "Create a CNAME", "body": "At your DNS provider, for blog.client.com.",
         "snippet": "blog.client.com.  CNAME  acme.plym.app."},
        {"actor": "plym", "title": "We issue the certificate", "body": "Automatically, once the record resolves."},
    ],
    ("cloudflare", "worker"): [
        {"actor": "customer", "title": "Create a Worker", "snippet": "export default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    url.hostname = 'acme.plym.app';\n    return fetch(url, request);\n  }\n};"},
        {"actor": "customer", "title": "Add a route", "body": "Route client.com/blog* to the Worker."},
    ],
    ("cloudflare", "subdomain"): [
        {"actor": "customer", "title": "Add a CNAME, DNS-only", "body": "Turn the orange cloud off — plym terminates TLS.",
         "snippet": "blog.client.com.  CNAME  acme.plym.app."},
    ],
    ("cloudflare", "path-proxy"): [],
    ("vercel", "rewrite"): [
        {"actor": "customer", "title": "Add a rewrite", "snippet": "{\n  \"rewrites\": [\n    { \"source\": \"/blog/:path*\", \"destination\": \"https://acme.plym.app/blog/:path*\" }\n  ]\n}"},
        {"actor": "customer", "title": "Redeploy", "snippet": "vercel --prod"},
    ],
    ("shopify", "subdomain"): [
        {"actor": "customer", "title": "Add a CNAME", "snippet": "blog.client.com.  CNAME  acme.plym.app."},
    ],
}

CHECKS = {
    "path-proxy": [{"command": "curl -sI https://client.com/blog/ | head -1", "expect": "HTTP/2 200"}],
    "subdomain": [{"command": "dig +short blog.client.com", "expect": "acme.plym.app."},
                  {"command": "curl -sI https://blog.client.com/ | head -1", "expect": "HTTP/2 200"}],
    "worker": [{"command": "curl -sI https://client.com/blog/ | head -1", "expect": "HTTP/2 200"}],
    "rewrite": [{"command": "curl -sI https://client.com/blog/ | head -1", "expect": "HTTP/2 200"}],
}

CAVEATS = {
    "path-proxy": ["Your CDN may cache the blog — set a max-age you're happy with.",
                   "Every published URL keeps the /blog prefix."],
    "subdomain": ["Readers see blog.client.com, not client.com/blog."],
}

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
            return 200, {"url": "https://client.com/blog", "prefix": "/blog", "running": True,
                         "state": "healthy", "image": "plymio/plym:1.2.0", "admin_version": "1.1.0"}
        if path == "/templates":
            return 200, TEMPLATES
        if path == "/routing":
            return 200, {"placement": PLACEMENT, "gateways": GATEWAYS,
                         "recommended": {"gateway": "nginx", "strategy": "path-proxy"}}
        m = re.fullmatch(r"/routing/([\w-]+)", path)
        if m:
            gid = m.group(1)
            gw = next((g for g in GATEWAYS if g["id"] == gid), None)
            if not gw:
                return 404, {"kind": "not_found", "error": "not_found", "message": f"No guide for {gid}."}
            wanted = query.get("strategy", [None])[0]
            strategies = []
            for s in gw["strategies"]:
                if wanted and s["id"] != wanted:
                    continue
                strategies.append({**s,
                                   "requires": ["Access to your DNS records"] if "subdomain" in s["id"] else ["Access to your edge configuration"],
                                   "steps": STEPS.get((gid, s["id"]), []),
                                   "checks": CHECKS.get(s["id"], []),
                                   "caveats": CAVEATS.get(s["id"], [])})
            return 200, {"gateway": {"id": gw["id"], "label": gw["label"]}, "placement": PLACEMENT,
                         "strategies": strategies}
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
