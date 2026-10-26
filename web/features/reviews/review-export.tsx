import type { RefObject } from 'react';
import type { ReviewDocument, ReviewDraft } from './review-values.ts';

export function ReviewPreview({
  document,
  previewRef,
}: {
  document: ReviewDocument | null;
  previewRef: RefObject<HTMLDivElement | null>;
}) {
  if (!document) return null;
  // Only the server's review export supplies this body. review-export.ts escapes
  // every user field before adding its fixed article/table markup. The preview
  // uses portal.css; inline styles are retained only for downloads/clipboard.
  const body = document.body.replace(/ style="[^"]*"/g, '');
  return <div id="review-preview" ref={previewRef} dangerouslySetInnerHTML={{ __html: body }} />;
}

export function downloadDocument(
  document: ReviewDocument,
  draft: ReviewDraft,
  format: 'html' | 'txt',
) {
  const html = format === 'html';
  const url = URL.createObjectURL(
    new Blob([html ? document.html : document.text], {
      type: html ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8',
    }),
  );
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `parecer-${draft.opened.calendar.year}-revisao-${draft.opened.review!.revision}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
