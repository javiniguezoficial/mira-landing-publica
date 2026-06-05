'use client'

import { useState, useRef } from 'react'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { uploadNewsImage } from '@/lib/actions/news'

interface Props {
  currentUrl?: string | null
  onUploaded: (url: string) => void
  onClear: () => void
}

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export function ImageUpload({ currentUrl, onUploaded, onClear }: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)

    if (!ACCEPTED.includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WebP.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('El archivo supera los 5 MB máximos.')
      return
    }

    // Preview local inmediato
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)
    setUploading(true)

    const fd = new FormData()
    fd.append('file', file)
    const result = await uploadNewsImage(fd)

    setUploading(false)

    if (result.error) {
      setError(result.error)
      setPreview(currentUrl ?? null)
      return
    }

    onUploaded(result.url!)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleClear = () => {
    setPreview(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
    onClear()
  }

  return (
    <div className="space-y-2">
      {preview ? (
        <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Vista previa"
            className="w-full h-48 object-cover"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 size={24} className="animate-spin text-mira-primary" />
            </div>
          )}
          {!uploading && (
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="p-1.5 bg-white rounded-lg shadow text-slate-600 hover:text-mira-primary transition-colors text-xs font-semibold flex items-center gap-1"
                title="Reemplazar imagen"
              >
                <Upload size={13} /> Reemplazar
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 bg-white rounded-lg shadow text-slate-400 hover:text-red-500 transition-colors"
                title="Eliminar imagen"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center h-36 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 cursor-pointer hover:border-mira-primary/50 hover:bg-mira-primary/5 transition-colors"
        >
          <ImageIcon size={24} className="text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-500">Haz clic o arrastra una imagen</p>
          <p className="text-xs text-slate-400 mt-0.5">JPG, PNG, WebP — máx. 5 MB</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  )
}
