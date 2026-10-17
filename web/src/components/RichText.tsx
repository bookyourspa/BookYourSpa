'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/format';

/**
 * Minimal rich-text editor — no dependencies. A contentEditable div plus a
 * small toolbar; every command is wrapped because execCommand is deprecated
 * (and absent in jsdom, where the DOM harness drives the form). The HTML it
 * emits is sanitised server-side on save (worker/src/richtext.ts) and again on
 * read, so only a fixed whitelist of formatting tags ever reaches a page.
 */
export function RichText({
  value, onChange, minHeight = 150, label = 'Rich text editor',
}: { value: string; onChange: (html: string) => void; minHeight?: number; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external value in (edit mode) without clobbering the caret while typing.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML ?? '');

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    try { document.execCommand(cmd, false, arg); } catch { /* execCommand is absent in jsdom */ }
    emit();
  };

  const makeLink = () => {
    const url = typeof window !== 'undefined' && typeof window.prompt === 'function'
      ? window.prompt('Link URL (https://…)', 'https://')
      : null;
    if (url && /^https?:\/\//i.test(url)) exec('createLink', url);
  };

  const btn = 'rounded px-2 py-1 text-xs font-semibold text-stone hover:bg-ink/8 hover:text-ink';
  return (
    <div className="rounded-xl border border-ink/10 focus-within:border-gold/60">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ink/8 px-2 py-1.5" role="toolbar" aria-label={label}>
        <button type="button" className={btn} aria-label="Bold" title="Bold"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>B</button>
        <button type="button" className={cn(btn, 'italic')} aria-label="Italic" title="Italic"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>I</button>
        <button type="button" className={cn(btn, 'underline')} aria-label="Underline" title="Underline"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}>U</button>
        <span className="mx-1 h-4 w-px bg-ink/10" aria-hidden />
        <button type="button" className={btn} aria-label="Heading" title="Heading"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'h3')}>H</button>
        <button type="button" className={btn} aria-label="Bulleted list" title="Bulleted list"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>• List</button>
        <button type="button" className={btn} aria-label="Quote" title="Quote"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'blockquote')}>“”</button>
        <span className="mx-1 h-4 w-px bg-ink/10" aria-hidden />
        <button type="button" className={btn} aria-label="Link" title="Link"
          onMouseDown={(e) => e.preventDefault()} onClick={makeLink}>🔗</button>
        <button type="button" className={btn} aria-label="Clear formatting" title="Clear formatting"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}>Tx</button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        onInput={emit}
        onBlur={emit}
        className="prose-sm max-w-none px-3 py-2.5 text-sm leading-relaxed text-ink focus:outline-none [&_a]:text-gold [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gold/50 [&_blockquote]:pl-3 [&_blockquote]:text-stone [&_h3]:font-display [&_h3]:text-lg [&_li]:my-0.5 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5"
        style={{ minHeight }}
      />
    </div>
  );
}
