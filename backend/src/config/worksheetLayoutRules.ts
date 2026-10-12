export const MIN_FONT_SIZE_PT = 18;
export const MIN_ANSWER_BOX_HEIGHT_PT = 24;
export const QUESTIONS_PER_PAGE_MAX = 4;

/**
 * What happens when the content does not fit (#603).
 *
 * The fixed minimums above always win. The page count is the only thing that
 * flexes: a question that does not fit in the space left moves to the next
 * page. Text is never shrunk below `MIN_FONT_SIZE_PT`, the answer box is never
 * made smaller than `MIN_ANSWER_BOX_HEIGHT_PT`, and a question is never cut.
 * A single question taller than a whole page is the one case that cannot be
 * helped by adding pages; it is placed alone on its own page, not dropped.
 */
export const OVERFLOW_POLICY = {
  minimumsWin: true,
  pageCountFlexes: true,
  shrinkToFit: false,
  truncateContent: false,
} as const;

/** Space kept free at the bottom of a page for the footer line. */
export const PAGE_BOTTOM_MARGIN_PT = 60;
/** Vertical gap between one question block and the next. */
export const QUESTION_GAP_PT = 30;

/**
 * Group question blocks into pages. `blockHeights[i]` is the height of block i
 * (its wrapped text plus its answer box). A block moves to a new page when the
 * page already holds `maxPerPage` blocks, or when it would not fit in the
 * height left. Returns, per page, the indexes of the blocks on it.
 */
export function planQuestionPages(
  blockHeights: number[],
  opts: { maxPerPage: number; availableHeight: number; gap: number },
): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;
  blockHeights.forEach((height, index) => {
    const fits = used + height <= opts.availableHeight;
    if (current.length > 0 && (current.length >= opts.maxPerPage || !fits)) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(index);
    used += height + opts.gap;
  });
  if (current.length > 0) pages.push(current);
  return pages;
}
