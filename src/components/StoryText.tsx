import { Fragment, type ReactNode } from 'react';
import { parseStory, type InlineRun, type StoryBlock } from '../lib/storyMarkup';

function Runs({ runs }: { runs: InlineRun[] }) {
  return <>{runs.map((run) => run.styles.reduce<ReactNode>((node, style) => {
    if (style === 'bold') return <strong>{node}</strong>;
    if (style === 'italic') return <em>{node}</em>;
    if (style === 'underline') return <u>{node}</u>;
    return <span className="story-large">{node}</span>;
  }, run.text)).map((node, index) => <Fragment key={index}>{node}</Fragment>)}</>;
}

const Lines = ({ lines }: { lines: InlineRun[][] }) =>
  <>{lines.map((line, index) => <Fragment key={index}>{index ? <br /> : null}<Runs runs={line} /></Fragment>)}</>;

function Block({ block, className, bookLines }: { block: StoryBlock; className?: string; bookLines?: boolean }) {
  // In the book every author line is a paragraph line of its own; the last one of a block carries the gap.
  if (bookLines && block.kind === 'paragraph') {
    return <>{block.lines.map((line, index) => {
      const classes = [index === 0 ? className : undefined, index === block.lines.length - 1 ? 'story-line--end' : undefined].filter(Boolean).join(' ');
      return <p key={index} className={classes || undefined}><Runs runs={line} /></p>;
    })}</>;
  }
  if (block.kind === 'heading') return <h4 className={'story-heading ' + (className ?? '')}><Runs runs={block.runs} /></h4>;
  if (block.kind === 'bullets') return <ul className={'story-list ' + (className ?? '')}>{block.items.map((item, index) => <li key={index}><Runs runs={item} /></li>)}</ul>;
  if (block.kind === 'numbers') return <ol className={'story-list ' + (className ?? '')} start={block.start}>{block.items.map((item, index) => <li key={index}><Runs runs={item} /></li>)}</ol>;
  if (block.kind === 'quote') return <blockquote className={'story-quote ' + (className ?? '')}><Lines lines={block.lines} /></blockquote>;
  return <p className={className}><Lines lines={block.lines} /></p>;
}

/**
 * A story's words with their formatting, the same on the moment page, in the
 * reader and in the editor's preview. `firstClassName` marks the first block
 * (a page that continues a paragraph from the previous one). `bookLines` is for
 * the book's pages: each line the author began is a paragraph line of its own.
 */
export function StoryText({ text, firstClassName, bookLines }: { text: string; firstClassName?: string; bookLines?: boolean }) {
  return <>{parseStory(text).map((block, index) => <Block key={index} block={block} bookLines={bookLines} className={index === 0 ? firstClassName : undefined} />)}</>;
}
