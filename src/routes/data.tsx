import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { DownloadSimple, UploadSimple, Warning } from '@phosphor-icons/react';
import { isApiError } from '@/api/errors';
import { downloadFile } from '@/lib/clipboard';
import {
  bundleFilename,
  exportBundle,
  importBundle,
  parseBundle,
  summarize,
  type Bundle,
  type ImportResult,
} from '@/lib/bundle';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
          <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Your content, portable. Both halves are built out of the ordinary API — plym
 * has no bulk endpoint — so they report progress rather than pretending a
 * hundred posts move instantly.
 */
export default function Data() {
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ done: number; total: number } | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Bundle | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const runExport = async () => {
    setExporting(true);
    setExported({ done: 0, total: 0 });
    try {
      const bundle = await exportBundle(setExported);
      downloadFile(
        bundleFilename(bundle.site?.name),
        JSON.stringify(bundle, null, 2),
        'application/json',
      );
      const counts = summarize(bundle);
      toast.success(
        `Exported ${counts.posts} ${counts.posts === 1 ? 'post' : 'posts'}.`,
      );
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not finish the export');
    } finally {
      setExporting(false);
      setExported(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setStaged(parseBundle(await file.text()));
      setResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read that file');
    } finally {
      // Let the same file be chosen twice in a row.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const runImport = async () => {
    if (!staged) return;
    setImporting(true);
    setProgress({ done: 0, total: staged.posts.length });
    try {
      const outcome = await importBundle(staged, setProgress);
      setResult(outcome);
      setStaged(null);
      toast.success(
        outcome.created > 0
          ? `Imported ${outcome.created} ${outcome.created === 1 ? 'post' : 'posts'}.`
          : 'Nothing new to import.',
      );
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not finish the import');
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const counts = staged ? summarize(staged) : null;

  return (
    <Page width="text">
      <PageHeader
        title="Data"
        description="Take everything with you, or bring it in from somewhere else."
      />

      <div className="mt-6 space-y-4">
        <Card
          title="Export"
          description="Every post with its body, plus categories, FAQs and an index of your media, in one JSON file."
        >
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => void runExport()} disabled={exporting}>
              <DownloadSimple size={16} />
              {exporting ? 'Collecting…' : 'Export everything'}
            </Button>
            {exporting && exported && exported.total > 0 && (
              <span className="text-[13px] text-fg-muted tnum">
                {exported.done} of {exported.total} posts
              </span>
            )}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-fg-subtle">
            <Warning size={13} className="mt-0.5 shrink-0" />
            Image files themselves aren't in the bundle — it lists what your posts
            reference so you can move them separately.
          </p>
        </Card>

        <Card
          title="Import"
          description="Load a bundle exported from another plym blog. Posts arrive with the status they had."
        >
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            disabled={importing}
          >
            <UploadSimple size={16} /> Choose a bundle
          </Button>
          <p className="mt-2 text-[12.5px] text-fg-subtle">
            A post whose slug already exists here is left untouched — importing the
            same bundle twice changes nothing the second time.
          </p>

          {result && (
            <div className="mt-3 rounded-lg border border-border bg-bg-subtle p-3 text-[13px]">
              <p className="text-fg">
                {result.created} created · {result.skipped} already here
                {result.categories > 0 && ` · ${result.categories} new categories`}
                {result.faqs > 0 && ` · ${result.faqs} new FAQs`}
              </p>
              {result.failures.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {result.failures.map((f) => (
                    <li key={f.slug} className="text-danger">
                      <span className="font-mono text-[12.5px]">{f.slug}</span> — {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Confirm what's in the file before any of it is written. */}
      <Modal
        open={Boolean(staged) || importing}
        onClose={() => !importing && setStaged(null)}
        label="Import bundle"
      >
        <div className="p-5">
          <h2 className="text-[17px] font-semibold tracking-tight text-fg">
            Import this bundle?
          </h2>
          {counts && (
            <p className="mt-1 text-sm text-fg-muted">
              {counts.posts} {counts.posts === 1 ? 'post' : 'posts'}, {counts.categories}{' '}
              {counts.categories === 1 ? 'category' : 'categories'} and {counts.faqs}{' '}
              {counts.faqs === 1 ? 'FAQ' : 'FAQs'}
              {staged?.site?.name ? ` from ${staged.site.name}` : ''}
              {staged?.exported_at ? `, exported ${staged.exported_at.slice(0, 10)}` : ''}.
            </p>
          )}
          {importing && progress && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[13px] text-fg-muted tnum">
                {progress.done} of {progress.total} posts
              </p>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStaged(null)} disabled={importing}>
              Cancel
            </Button>
            <Button variant="accent" onClick={() => void runImport()} disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
