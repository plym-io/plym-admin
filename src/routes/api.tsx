import { useEffect, useMemo, useState } from 'react';
import { CaretRight, Code, LockSimple, MagnifyingGlass } from '@phosphor-icons/react';
import { apiBase } from '@/lib/base';
import { fetchSpec } from '@/lib/openapi-source';
import {
  groupByTag,
  listOperations,
  matchesQuery,
  schemaFields,
  typeLabel,
  type Field,
  type HttpMethod,
  type OpenApiDocument,
  type Operation,
} from '@/lib/openapi';
import { useDebouncedValue } from '@/hooks/use-debounced';
import { Page, PageHeader, Panel } from '@/components/ui/page';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Snippet } from '@/components/cloud/Snippet';
import { cn } from '@/lib/classnames';

const METHOD_STYLE: Record<HttpMethod, string> = {
  get: 'bg-success/12 text-success border-success/25',
  post: 'bg-accent-soft text-accent border-accent/25',
  put: 'bg-warning/12 text-warning border-warning/25',
  patch: 'bg-warning/12 text-warning border-warning/25',
  delete: 'bg-danger/12 text-danger border-danger/25',
  head: 'bg-bg-muted text-fg-muted border-border',
  options: 'bg-bg-muted text-fg-muted border-border',
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={cn(
        'inline-flex w-[54px] shrink-0 items-center justify-center rounded border px-1 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wide',
        METHOD_STYLE[method],
      )}
    >
      {method}
    </span>
  );
}

function statusTone(status: string): string {
  if (status.startsWith('2')) return 'text-success';
  if (status.startsWith('4') || status.startsWith('5')) return 'text-danger';
  return 'text-fg-muted';
}

/** A schema's fields, indented by nesting. */
function FieldList({ fields, depth = 0 }: { fields: Field[]; depth?: number }) {
  return (
    <ul className={cn(depth > 0 && 'mt-1 border-l border-border pl-3')}>
      {fields.map((f) => (
        <li key={f.name} className="py-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <code className="font-mono text-[12.5px] text-fg">{f.name}</code>
            <span className="font-mono text-[11.5px] text-fg-subtle">{f.type}</span>
            {f.required && (
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-warning">
                required
              </span>
            )}
          </div>
          {f.description && (
            <p className="mt-0.5 text-[12px] text-fg-muted">{f.description}</p>
          )}
          {f.children && <FieldList fields={f.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">
      {children}
    </p>
  );
}

function OperationRow({
  op,
  doc,
  baseUrl,
}: {
  op: Operation;
  doc: OpenApiDocument;
  baseUrl: string;
}) {
  const [open, setOpen] = useState(false);

  const bodyFields = useMemo(
    () => (open && op.requestBody?.schema ? schemaFields(doc, op.requestBody.schema) : []),
    [open, op.requestBody, doc],
  );

  // The 2xx response is the one worth expanding; errors are listed by status.
  const success = op.responses.find((r) => r.status.startsWith('2'));
  const successFields = useMemo(
    () => (open && success?.schema ? schemaFields(doc, success.schema) : []),
    [open, success, doc],
  );

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-subtle"
      >
        <CaretRight
          size={12}
          className={cn(
            'shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-90',
          )}
        />
        <MethodBadge method={op.method} />
        <code
          className={cn(
            'min-w-0 truncate font-mono text-[12.5px] text-fg',
            op.deprecated && 'line-through opacity-60',
          )}
        >
          {op.path}
        </code>
        {op.summary && (
          <span className="ml-auto hidden min-w-0 truncate pl-4 text-[12.5px] text-fg-muted md:block">
            {op.summary}
          </span>
        )}
        {op.secured && (
          <LockSimple
            size={12}
            className="ml-auto shrink-0 text-fg-subtle md:ml-0"
            aria-label="Requires authentication"
          />
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border bg-bg-subtle px-4 py-4">
          {op.description && (
            <p className="text-[13px] leading-relaxed text-fg-muted">{op.description}</p>
          )}

          <Snippet
            code={`curl -X ${op.method.toUpperCase()} '${baseUrl}${op.path}'${
              op.secured ? " \\\n  -H 'Authorization: Bearer <token>'" : ''
            }${op.requestBody ? " \\\n  -H 'Content-Type: application/json' \\\n  -d '{}'" : ''}`}
          />

          {op.parameters.length > 0 && (
            <div>
              <Subheading>Parameters</Subheading>
              <ul>
                {op.parameters.map((p) => (
                  <li key={`${p.in}:${p.name}`} className="py-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <code className="font-mono text-[12.5px] text-fg">{p.name}</code>
                      <span className="rounded border border-border px-1 text-[10.5px] text-fg-subtle">
                        {p.in}
                      </span>
                      <span className="font-mono text-[11.5px] text-fg-subtle">
                        {typeLabel(doc, p.schema)}
                      </span>
                      {p.required && (
                        <span className="text-[10.5px] font-medium uppercase tracking-wide text-warning">
                          required
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="mt-0.5 text-[12px] text-fg-muted">{p.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {op.requestBody && (
            <div>
              <Subheading>
                Request body{op.requestBody.required ? ' · required' : ''}
              </Subheading>
              {bodyFields.length > 0 ? (
                <FieldList fields={bodyFields} />
              ) : (
                <p className="font-mono text-[12px] text-fg-muted">
                  {typeLabel(doc, op.requestBody.schema)}
                </p>
              )}
            </div>
          )}

          <div>
            <Subheading>Responses</Subheading>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {op.responses.map((r) => (
                <span key={r.status} className="text-[12.5px]">
                  <span className={cn('font-mono font-semibold', statusTone(r.status))}>
                    {r.status}
                  </span>
                  {r.description && (
                    <span className="ml-1.5 text-fg-muted">{r.description}</span>
                  )}
                </span>
              ))}
            </div>
            {successFields.length > 0 && (
              <div className="mt-2">
                <FieldList fields={successFields} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The API reference, rendered from the blog's own OpenAPI document rather than
 * from anything checked in here — so it describes the API this deployment is
 * actually running, version drift included.
 */
export default function ApiReference() {
  const [doc, setDoc] = useState<OpenApiDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query, 150);

  useEffect(() => {
    let cancelled = false;

    void fetchSpec().then((spec) => {
      if (cancelled) return;
      if (spec) setDoc(spec);
      else setFailed(true);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const operations = useMemo(() => (doc ? listOperations(doc) : []), [doc]);
  const groups = useMemo(
    () => groupByTag(operations.filter((op) => matchesQuery(op, search))),
    [operations, search],
  );

  const baseUrl = `${window.location.origin}${apiBase}`;

  return (
    <Page width="wide">
      <PageHeader
        title="API"
        description={
          doc?.info
            ? `${doc.info.title ?? 'plym'} ${doc.info.version ?? ''} · OpenAPI ${doc.openapi}`
            : 'REST reference for this blog.'
        }
        actions={
          doc ? (
            <div className="relative w-56">
              <MagnifyingGlass
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter endpoints…"
                className="pl-8"
              />
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : failed ? (
        <Panel className="mt-6">
          <EmptyState
            icon={Code}
            title="No OpenAPI document published."
            hint="This blog is running a plym old enough that it only serves its spec in debug mode. Update plym to expose it at /api/openapi.json."
          />
        </Panel>
      ) : groups.length === 0 ? (
        <EmptyState className="mt-6" icon={MagnifyingGlass} title="No matching endpoints." />
      ) : (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-fg-muted">
            <span>
              Base URL <code className="font-mono text-fg">{baseUrl}</code>
            </span>
            <span className="flex items-center gap-1">
              <LockSimple size={12} /> Bearer token
            </span>
          </div>

          {groups.map((group) => (
            <section key={group.tag}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                {group.tag}
                <span className="ml-2 font-normal normal-case tracking-normal text-fg-subtle tnum">
                  {group.operations.length}
                </span>
              </h2>
              <Panel flush className="divide-y divide-border overflow-hidden">
                {group.operations.map((op) => (
                  <OperationRow key={op.id} op={op} doc={doc!} baseUrl={baseUrl} />
                ))}
              </Panel>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
