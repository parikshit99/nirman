import { Fragment, type ReactNode } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from './ui/Button.tsx';
import { Sheet } from './ui/Sheet.tsx';
import type { ReleaseNotes } from '../lib/whatsNew.ts';

/** **bold** and *italic* inside a line of the changelog. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <i key={i}>{part.slice(1, -1)}</i>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Paragraphs, "**Heading**" lines and "- " bullets, grouped into blocks. */
function render(lines: string[]) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={out.length} className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (!line) continue;
    const heading = /^\*\*(.+)\*\*$/.exec(line);
    out.push(
      heading ? (
        <h4 key={out.length} className="text-xs font-bold text-orange-600 pt-2">
          {heading[1]}
        </h4>
      ) : (
        <p key={out.length} className="text-sm text-gray-600">
          {inline(line)}
        </p>
      ),
    );
  }
  flush();
  return out;
}

/** The newest section of the changelog, shown once after an update and from Settings. */
export function WhatsNewModal({ notes, onClose }: { notes: ReleaseNotes; onClose(): void }) {
  return (
    <Sheet kind="dialog" size="lg" scroll={false} labelledBy="whats-new-title" onClose={onClose}>
      <div className="p-5 pb-3 flex justify-between items-start gap-3 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-500 font-bold flex items-center gap-1">
            <Sparkles size={12} className="text-orange-500" /> What's new · version {notes.version}
          </p>
          <h3 id="whats-new-title" className="font-bold text-lg text-gray-900 mt-0.5">
            {notes.title || `Nirman ${notes.version}`}
          </h3>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-black" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="p-5 pt-3 space-y-3 overflow-y-auto">{render(notes.lines)}</div>
      <div className="p-4 border-t border-gray-100">
        <Button variant="primary" block onClick={onClose}>
          Got it
        </Button>
      </div>
    </Sheet>
  );
}
