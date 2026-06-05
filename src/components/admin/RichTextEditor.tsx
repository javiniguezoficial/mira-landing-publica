'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Bold, Italic, List, ListOrdered, Link2, Heading2, Heading3, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useCallback } from 'react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

// Solo http / https / mailto — bloquea javascript: y cualquier otro protocolo
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Sólo permitimos H2 y H3 — desactivamos H1, H4-H6 y blockquote/codeBlock
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
        validate: (url) => isSafeUrl(url),
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'min-h-[240px] px-4 py-3 text-sm text-slate-700 focus:outline-none leading-relaxed',
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    immediatelyRender: false,
  })

  // Sync external value changes (ej: reset de formulario)
  useEffect(() => {
    if (!editor) return
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  const setLink = useCallback(() => {
    if (!editor) return
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL del enlace (https://…):', previous ?? '')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    if (!isSafeUrl(url)) {
      window.alert('Solo se permiten URLs con http://, https:// o mailto:')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  if (!editor) return null

  const btn = (active: boolean) =>
    cn(
      'p-1.5 rounded transition-colors',
      active
        ? 'bg-mira-primary text-white'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
    )

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-mira-primary/30 focus-within:border-mira-primary">
      {/* Barra de herramientas */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex-wrap">
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))} title="Título H2">
          <Heading2 size={16} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))} title="Título H3">
          <Heading3 size={16} />
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Negrita">
          <Bold size={16} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Cursiva">
          <Italic size={16} />
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Lista">
          <List size={16} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Lista numerada">
          <ListOrdered size={16} />
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" onClick={setLink} className={btn(editor.isActive('link'))} title="Enlace">
          <Link2 size={16} />
        </button>
        {editor.isActive('link') && (
          <button type="button" onClick={() => editor.chain().focus().unsetLink().run()} className={btn(false)} title="Quitar enlace">
            <Unlink size={16} />
          </button>
        )}
      </div>

      {/* Área de edición */}
      <div className="bg-white relative">
        {!value || value === '<p></p>' ? (
          <span className="absolute top-3 left-4 text-sm text-slate-400 pointer-events-none select-none">
            {placeholder ?? 'Escribe el contenido de la noticia…'}
          </span>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
