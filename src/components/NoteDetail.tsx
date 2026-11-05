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
  盘后: 'bg-[#efe9fd] text-[#6446bc]',
  周总结: 'bg-gain-soft text-gain',
}

const MOOD_DOT: Record<Mood, string> = {
  平静: '#0b6cf0',
  专注: '#12805c',
  焦躁: '#c7443e',
  疲惫: '#a9691a',
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
      <div className="fade-in mx-auto max-w-[760px] px-8 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[15px] font-semibold text-ink">
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
              <X size={13} />
              取消
            </button>
            <button className="btn btn-primary" onClick={save}>
              <Check size={13} />
              保存笔记
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
            {error}
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
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
              className="input h-9 text-[13.5px]"
              placeholder="今天最重要的一件事是什么？"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="field-label">正文</span>
            <textarea
              name="body"
              className="textarea min-h-[320px] text-[13px] leading-7"
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
    <div className="fade-in mx-auto max-w-[760px] px-8 py-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span
            className={`inline-flex h-5 items-center rounded px-1.5 text-[10.5px] font-medium ${KIND_STYLE[note.kind]}`}
          >
            {note.kind}
          </span>
          <span>{fmtDateFullCN(note.date)}</span>
          <span className="text-line-2">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: MOOD_DOT[note.mood] }}
            />
            {note.mood}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {confirm ? (
            <>
              <button
                className="btn btn-danger h-7 px-2.5 text-[11px]"
                onClick={() => onDelete(note.id)}
              >
                确认删除
              </button>
              <button
                className="btn btn-secondary h-7 px-2.5 text-[11px]"
                onClick={() => setConfirm(false)}
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn" aria-label="编辑笔记" onClick={() => setEditing(true)}>
                <Pencil size={15} />
              </button>
              <button
                className="icon-btn hover:text-loss"
                aria-label="删除笔记"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <h1 className="mt-4 text-[23px] font-semibold leading-snug tracking-[-0.01em] text-ink">
        {note.title || '未命名笔记'}
      </h1>

      <div className="mt-5 whitespace-pre-wrap text-[13px] leading-7 text-ink-2">
        {note.body || <span className="text-faint">这篇笔记还没有正文。</span>}
      </div>

      {note.tags.length ? (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="divider my-6" />

      <div className="flex items-center justify-between text-[10.5px] text-faint">
        <span>写下来，比记在脑子里更可靠。</span>
        <button className="btn btn-ghost h-7 px-2 text-[11px]" onClick={startCreate}>
          再写一篇
        </button>
      </div>
    </div>
  )
}
