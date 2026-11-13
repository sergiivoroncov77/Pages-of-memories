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

function Block({ block, className }: { block: StoryBlock; className?: string }) {
  if (block.kind === 'heading') return <h4 className={'story-heading ' + (className ?? '')}><Runs runs={block.runs} /></h4>;
  if (block.kind === 'bullets') return <ul className={'story-list ' + (className ?? '')}>{block.items.map((item, index) => <li key={index}><Runs runs={item} /></li>)}</ul>;
  if (block.kind === 'numbers') return <ol className={'story-list ' + (className ?? '')} start={block.start}>{block.items.map((item, index) => <li key={index}><Runs runs={item} /></li>)}</ol>;
  if (block.kind === 'quote') return <blockquote className={'story-quote ' + (className ?? '')}><Lines lines={block.lines} /></blockquote>;
  return <p className={className}><Lines lines={block.lines} /></p>;
}

/**
 * A story's words with their formatting, the same on the moment page, in the
 * reader and in the editor's preview. `firstClassName` marks the first block
 * (a page that continues a paragraph from the previous one).
 */
export function StoryText({ text, firstClassName }: { text: string; firstClassName?: string }) {
  return <>{parseStory(text).map((block, index) => <Block key={index} block={block} className={index === 0 ? firstClassName : undefined} />)}</>;
}
