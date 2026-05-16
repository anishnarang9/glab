import Link from 'next/link'

export default function TeamPage() {
  return (
    <main className="min-h-screen bg-[#f7f6ff] px-6 py-10 text-indigo-950">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-indigo-500 hover:text-indigo-700">
            LabBrain
          </Link>
          <Link href="/upload" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">
            Share artifact
          </Link>
        </header>

        <section className="flex flex-col gap-3">
          <p className="text-sm text-indigo-500">Head Central GBrain</p>
          <h1 className="text-3xl font-semibold tracking-tight">Team truth state</h1>
          <p className="max-w-2xl text-sm leading-6 text-indigo-700">
            Shared researcher artifacts and live sources flow into OpenClaw, then into the Central GBrain&apos;s
            evidence, truth claims, and brain commits.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            ['Evidence', 'Shared artifacts, papers, feeds, and web sources'],
            ['OpenClaw decisions', 'Recorded relevance decisions before truth changes'],
            ['Brain commits', 'Mini git-style history of what the brain learned'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-indigo-100 bg-white p-5 shadow-sm shadow-indigo-100">
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-indigo-600">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
