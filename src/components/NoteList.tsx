import { useMemo } from 'react'
import { BookOpen, Plus, SearchX } from 'lucide-react'
import type { JournalNote, NoteKind } from '../types'
import { fmtDateCN, weekdayCN } from '../lib/format'
import { EmptyState } from './primitives'

const KIND_STYLE: Record<NoteKind, string> = {
  盘前: 'bg-accent-soft text-accent',
  盘中: 'bg-warn-soft text-warn',
  盘后: 'bg-canvas text-muted',
  周总结: 'bg-gain-soft text-gain',
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onNew,
  query,
}: {
  notes: JournalNote[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  query: string
}) {
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = notes.filter((note) => {
      if (!q) return true
      return [note.title, note.body, note.kind, note.mood, ...note.tags]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    const sorted = [...filtered].sort((a, b) =>
      `${b.date} ${b.id}`.localeCompare(`${a.date} ${a.id}`),
    )
    const map = new Map<string, JournalNote[]>()
    for (const note of sorted) {
      const list = map.get(note.date) ?? []
      list.push(note)
      map.set(note.date, list)
    }
    return { total: filtered.length, entries: [...map.entries()] }
  }, [notes, query])

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <div>
          <h1 className="text-base font-medium text-ink">复盘笔记</h1>
          <p className="mt-1 text-xs text-muted">
            {groups.total} 篇{query ? ` · 搜索“${query}”` : ''}
          </p>
        </div>
        <button className="icon-btn" onClick={onNew} aria-label="新建笔记">
          <Plus size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.entries.map(([date, items]) => (
          <section key={date}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-list/95 px-2 pb-1.5 pt-4 text-xs text-muted backdrop-blur-sm">
              <span>
                {fmtDateCN(date)} · {weekdayCN(date)}
              </span>
              <span className="font-mono">{items.length} 篇</span>
            </div>
            <div className="space-y-0.5">
              {items.map((note) => (
                <button
                  key={note.id}
                  className={`list-row items-start ${selectedId === note.id ? 'list-row-active' : ''}`}
                  onClick={() => onSelect(note.id)}
                >
                  <span
                    className={`mt-0.5 inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium ${KIND_STYLE[note.kind]}`}
                  >
                    {note.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{note.title}</div>
                    <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
                      <span className="shrink-0">{note.mood}</span>
                      {note.tags[0] ? (
                        <>
                          <span className="text-line-2">·</span>
                          <span className="truncate">{note.tags.join(' / ')}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}

        {!groups.entries.length ? (
          <EmptyState
            icon={query ? <SearchX size={18} /> : <BookOpen size={18} />}
            title={query ? '没有匹配的笔记' : '还没有复盘笔记'}
            description={
              query
                ? '试试搜索日期、形态或情绪。'
                : '把盘前计划、盘中判断和盘后反思写下来，才是复盘的开始。'
            }
            action={
              !query ? (
                <button className="btn btn-primary" onClick={onNew}>
                  <Plus size={14} />
                  写第一篇
                </button>
              ) : null
            }
          />
        ) : null}
      </div>
    </>
  )
}
