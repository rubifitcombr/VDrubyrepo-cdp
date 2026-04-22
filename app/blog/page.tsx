import Link from 'next/link'
import { BLOG_POSTS } from '@/lib/blog-posts'

export default function BlogIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-brand text-3xl font-bold tracking-tight text-vyria-navy">
        Blog
      </h1>
      <p className="mt-3 text-vyria-navy-muted">
        Artigos sobre a plataforma e boas práticas para a tua loja.
      </p>
      <ul className="mt-10 space-y-8">
        {BLOG_POSTS.map((post) => (
          <li key={post.slug}>
            <article className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <time
                dateTime={post.date}
                className="text-xs font-medium uppercase tracking-wide text-vyria-navy-muted"
              >
                {post.date}
              </time>
              <h2 className="mt-2 font-brand text-xl font-semibold text-vyria-navy">
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-vyria-plum hover:text-vyria-orange hover:underline"
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-vyria-navy-muted">
                {post.excerpt}
              </p>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-4 inline-block text-sm font-semibold text-vyria-plum hover:text-vyria-orange"
              >
                Ler artigo →
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </main>
  )
}
