'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'

const ARTIFACT_TYPES = ['project', 'note', 'paper_ref', 'finding', 'hypothesis'] as const

export default function UploadPage() {
  const [status, setStatus] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('Sharing...')
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_id: form.get('owner_id'),
        title: form.get('title'),
        type: form.get('type'),
        content: form.get('content'),
        tier: form.get('share') === 'on' ? 'shared' : 'private',
      }),
    })

    setStatus(response.ok ? 'Saved' : 'Save failed')
  }

  return (
    <main className="min-h-screen bg-[#f7f6ff] px-6 py-10 text-indigo-950">
      <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <Link href="/" className="text-sm font-medium text-indigo-500 hover:text-indigo-700">
          LabBrain
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Share research artifact</h1>

        <input name="owner_id" required placeholder="Researcher ID" className="rounded-lg border border-indigo-100 p-3 text-sm" />
        <input name="title" placeholder="Title" className="rounded-lg border border-indigo-100 p-3 text-sm" />
        <select name="type" defaultValue="finding" className="rounded-lg border border-indigo-100 p-3 text-sm">
          {ARTIFACT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <textarea name="content" required rows={10} placeholder="Evidence, note, project update, or finding" className="rounded-lg border border-indigo-100 p-3 text-sm" />

        <label className="flex items-center gap-3 text-sm text-indigo-700">
          <input name="share" type="checkbox" className="h-4 w-4" />
          Share into the head Central GBrain
        </label>

        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white">
          Save artifact
        </button>
        {status && <p className="text-sm text-indigo-600">{status}</p>}
      </form>
    </main>
  )
}
