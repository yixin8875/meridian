import { useEffect, useState } from 'react'
import { BookOpen, Check, Pencil, Trash2, X } from 'lucide-react'
import type { JournalNote, Mood, NoteKind } from '../types'
import { MOODS, NOTE_KINDS } from '../data/contracts'
import { fmtDateFullCN, todayISO, uid } from '../lib/format'
import { EmptyState } from './primitives'

function blankNote(accountId: string): JournalNote {
  return {
    id: uid('n'),
    accountId,
    date: todayISO(),
    kind: '盘后',
    title: '',
    body: '',
    tags: [],
    mood: '平静',
  }
}

const KIND_STYLE: Record<NoteKind, string> = {
  盘前: 'bg-accent-soft text-accent',
  盘中: 'bg-warn-soft text-warn',
  盘后: 'bg-canvas text-muted',
  周总结: 'bg-gain-soft text-gain',
}

export function NoteDetail({
  note,
  creating,
  accountId,
  onSave,
  onDelete,
  onCancelCreate,
}: {
  note: JournalNote | null
  creating: boolean
  accountId: string
  onSave: (note: JournalNote) => void
  onDelete: (id: string) => void
  onCancelCreate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<JournalNote>(() => blankNote(accountId))
  const [tagsText, setTagsText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const noteId = note?.id ?? null

  useEffect(() => {
    setEditing(creating)
    setConfirm(false)
    setError(null)
    if (note) {
      setDraft({ ...note, tags: [...note.tags] })
      setTagsText(note.tags.join('，'))
    } else if (creating) {
      setDraft(blankNote(accountId))
      setTagsText('')
    }
  }, [noteId, creating, note, accountId])

  if (!note && !creating) {
    return (
      <EmptyState
        icon={<BookOpen size={18} />}
        title="选择一篇笔记"
        description="盘前计划、盘中判断、盘后复盘，都值得被完整记录。"
      />
    )
  }

  const startCreate = () => {
    setDraft(blankNote(accountId))
    setTagsText('')
    setEditing(true)
    setError(null)
  }

  const save = () => {
    const title = draft.title.trim()
    const body = draft.body.trim()
    if (!title && !body) {
      setError('至少写一个标题或一段正文。')
      return
    }
    const tags = tagsText
      .split(/[,，、\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8)
    onSave({
      ...draft,
      title: title || '未命名笔记',
      body,
      tags,
    })
    setEditing(false)
    setError(null)
  }

  if (editing) {
    return (
      <div className="fade-in mx-auto max-w-4xl px-8 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-medium text-ink">
            {creating ? '新建复盘笔记' : '编辑笔记'}
          </h1>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setEditing(false)
                setError(null)
                if (creating) onCancelCreate()
              }}
            >
              <X size={16} strokeWidth={1.5} />
              取消
            </button>
            <button className="btn btn-primary" onClick={save}>
              <Check size={16} strokeWidth={1.5} />
              保存笔记
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-loss/25 bg-loss-soft px-4 py-3 text-sm text-loss">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <label>
              <span className="field-label">日期</span>
              <input
                type="date"
                name="date"
                className="input"
                value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              />
            </label>
            <label>
              <span className="field-label">类型</span>
              <select
                name="kind"
                className="input"
                value={draft.kind}
                onChange={(event) =>
                  setDraft({ ...draft, kind: event.target.value as NoteKind })
                }
              >
                {NOTE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">状态</span>
              <select
                name="mood"
                className="input"
                value={draft.mood}
                onChange={(event) => setDraft({ ...draft, mood: event.target.value as Mood })}
              >
                {MOODS.map((mood) => (
                  <option key={mood} value={mood}>
                    {mood}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="field-label">标题</span>
            <input
              name="title"
              className="input h-9 text-sm"
              placeholder="今天最重要的一件事是什么？"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="field-label">正文</span>
            <textarea
              name="body"
              className="textarea min-h-[320px] text-sm leading-7"
              placeholder={'市场发生了什么？\n你做了什么决定？\n下次要改的一件事…'}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="field-label">标签（用逗号分隔）</span>
            <input
              name="tags"
              className="input"
              placeholder="耐心，失败拍卖，ES"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
            />
          </label>
        </div>
      </div>
    )
  }

  if (!note) return null

  return (
    <div className="fade-in mx-auto max-w-4xl px-8 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span
            className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${KIND_STYLE[note.kind]}`}
          >
            {note.kind}
          </span>
          <span>{fmtDateFullCN(note.date)}</span>
          <span className="text-line-2">·</span>
          <span>{note.mood}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {confirm ? (
            <>
              <button
                className="btn btn-danger h-8 px-2.5 text-xs"
                onClick={() => onDelete(note.id)}
              >
                确认删除
              </button>
              <button
                className="btn btn-secondary h-8 px-2.5 text-xs"
                onClick={() => setConfirm(false)}
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn" aria-label="编辑笔记" onClick={() => setEditing(true)}>
                <Pencil size={16} strokeWidth={1.5} />
              </button>
              <button
                className="icon-btn hover:text-loss"
                aria-label="删除笔记"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>
      </div>

      <h1 className="mt-6 text-3xl font-medium leading-snug text-ink">
        {note.title || '未命名笔记'}
      </h1>

      <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-ink-2">
        {note.body || <span className="text-faint">这篇笔记还没有正文。</span>}
      </div>

      {note.tags.length ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="divider my-8" />

      <div className="flex items-center justify-between text-sm text-faint">
        <span>写下来，比记在脑子里更可靠。</span>
        <button className="btn btn-ghost h-8 px-2.5 text-xs" onClick={startCreate}>
          再写一篇
        </button>
      </div>
    </div>
  )
}
