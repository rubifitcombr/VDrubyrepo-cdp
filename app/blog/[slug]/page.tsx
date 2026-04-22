import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BLOG_POSTS, getBlogPost } from '@/lib/blog-posts'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return { title: 'Artigo | Vyria Delivery' }
  return {
    title: `${post.title} | Vyria Delivery`,
    description: post.excerpt,
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-sm text-vyria-navy-muted">
        <Link href="/blog" className="font-semibold text-vyria-plum hover:text-vyria-orange">
          Blog
        </Link>
        <span className="mx-2 text-vyria-navy-muted/50">/</span>
        <time dateTime={post.date}>{post.date}</time>
      </p>
      <h1 className="font-brand mt-4 text-3xl font-bold tracking-tight text-vyria-navy sm:text-4xl">
        {post.title}
      </h1>
      <div className="mt-8 space-y-4 text-base leading-relaxed text-vyria-navy-muted">
        {post.paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <p className="mt-12">
        <Link
          href="/blog"
          className="text-sm font-semibold text-vyria-plum hover:text-vyria-orange"
        >
          ← Todos os artigos
        </Link>
      </p>
    </main>
  )
}
