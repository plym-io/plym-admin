/**
 * Google Docs and Word put a `text/html` flavour on the clipboard that is not
 * semantic HTML: emphasis is inline CSS on `<span>`, Docs nests lists by
 * emitting flat sibling `<ul>`s with a wider margin, and Word doesn't emit
 * lists at all — it emits paragraphs with the bullet glyph baked in as text.
 *
 * This module turns either of those into ordinary semantic HTML, so the
 * markdown converter downstream only ever sees `<h2>`, `<strong>`, `<ul>`.
 * It is a DOM-in/DOM-out normaliser and nothing else — no markdown here.
 */

export interface Normalised {
  body: HTMLElement;
  /** Images whose source can't survive the trip into a post. */
  droppedImages: number;
}

type Decls = Record<string, string>;

interface Marks {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
}

const NO_MARKS: Marks = { bold: false, italic: false, strike: false, code: false };

/**
 * Docs writes plain runs as `font-weight:400` and bold ones as `700`, so the
 * threshold has to sit between them rather than at "is the tag a <b>".
 */
const BOLD_WEIGHT = 600;

const MONO_FAMILY =
  /courier|consolas|monaco|menlo|inconsolata|source code pro|roboto mono|ui-monospace|monospace/i;

/** Inline elements that only ever carried styling; flattened before rebuilding. */
const INLINE_STYLING = 'span,b,strong,i,em,u,s,strike,del,font,ins,mark,small,big';

const DROP_ENTIRELY = 'style,script,meta,link,title,colgroup,col,o\\:p,v\\:shapetype,v\\:shape';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DD', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE',
  'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

const NBSP = / /g;

function parseDecls(css: string): Decls {
  const out: Decls = {};
  for (const part of css.split(';')) {
    const at = part.indexOf(':');
    if (at === -1) continue;
    const prop = part.slice(0, at).trim().toLowerCase();
    if (prop) out[prop] = part.slice(at + 1).trim().toLowerCase();
  }
  return out;
}

/**
 * Word states most of its formatting in a `<style>` block against classes
 * (`p.MsoNormal`, `span.MsoHyperlink`) rather than inline, so the class rules
 * have to be resolved before any element's own style can be read.
 */
function classStyles(root: ParentNode): Map<string, Decls> {
  const out = new Map<string, Decls>();
  for (const el of root.querySelectorAll('style')) {
    const css = (el.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = parseDecls(body);
      if (Object.keys(decls).length === 0) continue;
      for (const selector of selectors.split(',')) {
        const named = selector.trim().match(/\.([\w-]+)$/);
        if (!named) continue;
        out.set(named[1], { ...out.get(named[1]), ...decls });
      }
    }
  }
  return out;
}

function stylesOf(el: Element, classes: Map<string, Decls>): Decls {
  let decls: Decls = {};
  for (const cls of Array.from(el.classList)) {
    const named = classes.get(cls);
    if (named) decls = { ...decls, ...named };
  }
  return { ...decls, ...parseDecls(el.getAttribute('style') ?? '') };
}

/**
 * What this element contributes to the marks its text inherits. Style wins
 * over tag in both directions, which is the whole trick: Docs wraps every
 * copied selection in `<b style="font-weight:normal">`, and that cancels
 * itself here instead of turning the whole document bold.
 */
function marksOf(el: Element, inherited: Marks, classes: Map<string, Decls>): Marks {
  const tag = el.tagName;
  const next: Marks = {
    bold: inherited.bold || tag === 'B' || tag === 'STRONG',
    italic: inherited.italic || tag === 'I' || tag === 'EM',
    strike: inherited.strike || tag === 'S' || tag === 'STRIKE' || tag === 'DEL',
    code: inherited.code || tag === 'CODE' || tag === 'TT' || tag === 'KBD',
  };

  const style = stylesOf(el, classes);

  const weight = style['font-weight'];
  if (weight) {
    next.bold =
      weight === 'bold' || weight === 'bolder' || Number(weight) >= BOLD_WEIGHT;
  }

  const fontStyle = style['font-style'];
  if (fontStyle) next.italic = fontStyle === 'italic' || fontStyle === 'oblique';

  const decoration = style['text-decoration'] ?? style['text-decoration-line'];
  if (decoration) next.strike = decoration.includes('line-through');

  const family = style['font-family'];
  if (family) next.code = MONO_FAMILY.test(family);

  return next;
}

/** Docs routes every link through a redirector; the real target is `?q=`. */
function unwrapRedirect(href: string): string | null {
  try {
    const url = new URL(href, 'https://example.invalid');
    if (url.hostname === 'www.google.com' && url.pathname === '/url') {
      return url.searchParams.get('q') ?? url.searchParams.get('url');
    }
  } catch {
    return href;
  }
  return href;
}

function isDeadLink(href: string): boolean {
  return (
    href.trim() === '' ||
    href.startsWith('file:') ||
    href.startsWith('#') ||
    href.startsWith('about:')
  );
}

/**
 * Depth of one of Docs' flat lists. The class carries it (`lst-kix_<id>-2`);
 * the `<li>` margin is the fallback, at one indent step per 36pt.
 */
function docsDepth(list: Element): number {
  for (const cls of Array.from(list.classList)) {
    const named = cls.match(/-(\d+)$/);
    if (named) return Number(named[1]);
  }
  const item = list.querySelector('li');
  const margin = item?.getAttribute('style')?.match(/margin-left:\s*([\d.]+)pt/);
  return margin ? Math.max(0, Math.round(Number(margin[1]) / 36) - 1) : 0;
}

/**
 * Docs emits a nested list as a *sibling* `<ul>` with a bigger margin rather
 * than one inside the parent `<li>`, so a straight conversion flattens every
 * outline. Fold the deeper runs back into the item above them, and merge runs
 * that only got split because the list was interrupted.
 */
function nestFlatLists(body: HTMLElement): void {
  const lists = Array.from(body.children).filter(
    (el) => el.tagName === 'UL' || el.tagName === 'OL',
  );
  const stack: { depth: number; list: Element }[] = [];

  for (const list of lists) {
    const depth = docsDepth(list);
    while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();

    const top = stack[stack.length - 1];
    if (top && top.depth === depth) {
      if (top.list.tagName === list.tagName) {
        while (list.firstChild) top.list.appendChild(list.firstChild);
        list.remove();
        continue;
      }
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      const host = parent.list.querySelector(':scope > li:last-of-type');
      if (host) host.appendChild(list);
    }
    stack.push({ depth, list });
  }
}

const WORD_BULLET = /^[·•▪●◦o§*-]$/;

/**
 * Word doesn't emit lists. It emits paragraphs carrying `mso-list` and hides
 * the bullet or number in a leading span, so untouched every item arrives as
 * a paragraph beginning with a stray "·".
 */
function rebuildWordLists(body: HTMLElement, classes: Map<string, Decls>): void {
  const doc = body.ownerDocument;

  const isItem = (el: Element): boolean =>
    'mso-list' in stylesOf(el, classes) || el.className.includes('MsoListParagraph');

  const levelOf = (el: Element): number => {
    const named = (stylesOf(el, classes)['mso-list'] ?? '').match(/level(\d+)/);
    return named ? Math.max(0, Number(named[1]) - 1) : 0;
  };

  /** `mso-list:l0 level1 lfo1` — `l0` is which list, not which level. */
  const idOf = (el: Element): string =>
    (stylesOf(el, classes)['mso-list'] ?? '').match(/\bl\d+\b/)?.[0] ?? '';

  /** The hidden marker also says which kind of list this is. */
  const takeMarker = (el: Element): string => {
    const holder = el.querySelector('[style*="mso-list"]');
    const glyph = (holder?.textContent ?? '').replace(NBSP, ' ').trim();
    holder?.remove();
    return glyph;
  };

  const items = Array.from(body.querySelectorAll('p')).filter(isItem);
  if (items.length === 0) return;

  let run: Element[] = [];

  const flush = (): void => {
    if (run.length === 0) return;

    // Every paragraph in the run gets removed as it is consumed, so the first
    // one can't stay the insertion point — hold the position with a marker.
    const marker = doc.createElement('div');
    run[0].parentNode?.insertBefore(marker, run[0]);

    interface Level { depth: number; ordered: boolean; id: string; list: Element }
    const stack: Level[] = [];

    for (const paragraph of run) {
      const depth = levelOf(paragraph);
      const id = idOf(paragraph);
      const glyph = takeMarker(paragraph);
      const ordered = glyph !== '' && !WORD_BULLET.test(glyph);

      while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
      let top = stack[stack.length - 1];

      // A different list at the same level is a different list, not a
      // continuation — Word numbers and bullets sit side by side as `l0`/`l1`.
      if (top && top.depth === depth && (top.ordered !== ordered || top.id !== id)) {
        stack.pop();
        top = stack[stack.length - 1];
      }

      if (!top || top.depth < depth) {
        const list = doc.createElement(ordered ? 'ol' : 'ul');
        if (top) {
          const host = top.list.querySelector(':scope > li:last-of-type');
          (host ?? top.list).appendChild(list);
        } else {
          marker.parentNode?.insertBefore(list, marker);
        }
        top = { depth, ordered, id, list };
        stack.push(top);
      }

      const item = doc.createElement('li');
      while (paragraph.firstChild) item.appendChild(paragraph.firstChild);
      top.list.appendChild(item);
      paragraph.remove();
    }

    marker.remove();
    run = [];
  };

  for (const paragraph of items) {
    const previous = run[run.length - 1];
    if (previous && previous.nextElementSibling !== paragraph) flush();
    run.push(paragraph);
  }
  flush();
}

/**
 * `data:` images would inline megabytes of base64 into the post and `file:`
 * ones point at the author's own disk, so neither can be carried across. They
 * are counted rather than dropped in silence — the caller says so out loud.
 */
function pruneImages(body: HTMLElement): number {
  let dropped = 0;
  for (const img of Array.from(body.querySelectorAll('img'))) {
    if (/^https?:/i.test(img.getAttribute('src') ?? '')) {
      img.setAttribute('alt', img.getAttribute('alt') || 'image');
      continue;
    }
    img.remove();
    dropped += 1;
  }
  return dropped;
}

/** Docs pads runs with NBSP; left alone they become literal U+00A0 in the post. */
function normaliseSpaces(body: HTMLElement): void {
  for (const text of textNodes(body)) {
    if (text.parentElement?.closest('pre')) continue;
    text.data = text.data.replace(NBSP, ' ');
  }
}

function textNodes(root: HTMLElement): Text[] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

function collectMarks(
  body: HTMLElement,
  classes: Map<string, Decls>,
): Map<Text, Marks> {
  const found = new Map<Text, Marks>();

  const walk = (node: Node, inherited: Marks): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        found.set(child as Text, inherited);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      if (el.tagName === 'PRE') continue;
      walk(el, marksOf(el, inherited, classes));
    }
  };

  walk(body, NO_MARKS);
  return found;
}

/**
 * Rebuild emphasis as tags. The marks were read before this point, so every
 * styling element can be flattened first and the semantic ones put back
 * around exactly the text they applied to.
 */
function applyMarks(body: HTMLElement, marks: Map<Text, Marks>): void {
  for (const el of Array.from(body.querySelectorAll(INLINE_STYLING))) {
    if (el.closest('pre')) continue;
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  const doc = body.ownerDocument;
  for (const [text, mark] of marks) {
    if (!text.isConnected) continue;
    if (!mark.bold && !mark.italic && !mark.strike && !mark.code) continue;
    if (text.data.replace(NBSP, ' ').trim() === '') continue;

    // Whitespace has to sit outside the markers: `** bold**` is not emphasis.
    const [, lead, core, tail] = text.data.match(/^(\s*)([\s\S]*?)(\s*)$/)!;

    let wrapped: Node = doc.createTextNode(core);
    for (const tag of [
      mark.code && 'code',
      mark.strike && 'del',
      mark.italic && 'em',
      mark.bold && 'strong',
    ]) {
      if (!tag) continue;
      const el = doc.createElement(tag);
      el.appendChild(wrapped);
      wrapped = el;
    }

    const fragment = doc.createDocumentFragment();
    if (lead) fragment.appendChild(doc.createTextNode(lead));
    fragment.appendChild(wrapped);
    if (tail) fragment.appendChild(doc.createTextNode(tail));
    text.replaceWith(fragment);
  }
}

function cleanLinks(body: HTMLElement): void {
  for (const anchor of Array.from(body.querySelectorAll('a'))) {
    const href = anchor.getAttribute('href');
    const target = href ? unwrapRedirect(href) : null;
    if (!target || isDeadLink(target)) {
      anchor.replaceWith(...Array.from(anchor.childNodes));
      continue;
    }
    for (const attr of Array.from(anchor.attributes)) {
      if (attr.name !== 'href') anchor.removeAttribute(attr.name);
    }
    anchor.setAttribute('href', target);
  }
}

/**
 * Word wraps its list markers in `<!--[if !supportLists]-->` conditionals, so
 * the comments have to go before anything tries to read the marker span.
 */
function stripNoise(body: HTMLElement): void {
  for (const el of Array.from(body.querySelectorAll(DROP_ENTIRELY))) el.remove();

  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) comments.push(n as Comment);
  for (const comment of comments) comment.remove();
}

/**
 * Docs and Word both bury content under wrapper `<div>`s that markdown has no
 * way to express. One holding only inline content is a paragraph; the rest
 * are scaffolding.
 */
function unwrapBlockNoise(body: HTMLElement): void {
  const doc = body.ownerDocument;
  for (const el of Array.from(
    body.querySelectorAll('div,section,article,header,footer,main,center'),
  )) {
    const parent = el.parentNode;
    if (!parent) continue;

    const hasBlockChild = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName));
    if (!hasBlockChild && (el.textContent ?? '').trim() !== '') {
      const paragraph = doc.createElement('p');
      while (el.firstChild) paragraph.appendChild(el.firstChild);
      el.replaceWith(paragraph);
      continue;
    }
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
}

/** Attributes are noise once the styles they carried have been read off. */
function stripAttributes(body: HTMLElement): void {
  for (const el of Array.from(body.querySelectorAll('*'))) {
    if (el.tagName === 'A' || el.tagName === 'IMG') continue;
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
  }
}

/**
 * Docs wraps each list item's text in its own `<p>`, which reads downstream as
 * a multi-paragraph item and puts a blank line between every bullet. An item
 * holding one paragraph is just an item.
 */
function unwrapListParagraphs(body: HTMLElement): void {
  for (const item of Array.from(body.querySelectorAll('li'))) {
    const paragraphs = Array.from(item.children).filter((c) => c.tagName === 'P');
    if (paragraphs.length !== 1) continue;
    const only = paragraphs[0];
    while (only.firstChild) item.insertBefore(only.firstChild, only);
    only.remove();
  }
}

/** Word carries its review comments along with the copied text. */
function stripWordComments(body: HTMLElement): void {
  for (const el of Array.from(
    body.querySelectorAll(
      '[style*="mso-element:comment"],a[class*="msocomanchor"],span[class*="MsoCommentReference"]',
    ),
  )) {
    el.remove();
  }
}

/** Docs ends every paste with an empty styled paragraph. */
function dropEmptyBlocks(body: HTMLElement): void {
  for (const el of Array.from(body.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6'))) {
    if (el.querySelector('img,table,ul,ol')) continue;
    if ((el.textContent ?? '').replace(NBSP, ' ').trim() === '') el.remove();
  }
}

export function normaliseOfficeHtml(html: string): Normalised {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const classes = classStyles(doc);
  const body = doc.body;

  stripNoise(body);
  stripWordComments(body);
  rebuildWordLists(body, classes);
  applyMarks(body, collectMarks(body, classes));
  cleanLinks(body);
  const droppedImages = pruneImages(body);
  normaliseSpaces(body);
  unwrapBlockNoise(body);
  unwrapListParagraphs(body);
  nestFlatLists(body);
  stripAttributes(body);
  dropEmptyBlocks(body);

  return { body, droppedImages };
}
