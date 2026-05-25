'use client'

import { useEffect, useMemo, useState } from 'react'

type SocialConnection = {
  id: string
  instagram_username: string | null
  page_name: string | null
  ad_account_id: string | null
  token_expires_at: string | null
}

type AdCampaign = {
  id: string
  name: string
  type: 'boost' | 'campaign'
  status: 'draft' | 'active' | 'paused' | 'completed' | 'error'
  post_id: string | null
  post_thumbnail_url: string | null
  post_type: string | null
  objective: string | null
  daily_budget: number | null
  start_date: string | null
  end_date: string | null
  target_city: string | null
  target_radius_km: number | null
  target_age_min: number | null
  target_age_max: number | null
  target_gender: string | null
  meta_campaign_id: string | null
  meta_ad_id: string | null
  spent: number | null
  reach: number | null
  clicks: number | null
  messages: number | null
  impressions: number | null
  metrics_updated_at: string | null
}

type InstagramPost = {
  id: string
  media_type: string
  media_url: string | null
  thumbnail_url: string | null
  caption: string
  timestamp: string | null
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function plusDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function mediaBadge(type: string | null | undefined) {
  const t = String(type ?? '').toUpperCase()
  if (t.includes('VIDEO')) return 'VÍDEO'
  if (t.includes('CAROUSEL')) return 'CARROSSEL'
  return 'FOTO'
}

function statusBadge(status: AdCampaign['status']) {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800'
    case 'paused':
      return 'bg-amber-100 text-amber-800'
    case 'completed':
      return 'bg-gray-100 text-gray-700'
    case 'error':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function statusLabel(status: AdCampaign['status']) {
  switch (status) {
    case 'active':
      return 'Ativa'
    case 'paused':
      return 'Pausada'
    case 'completed':
      return 'Concluída'
    case 'error':
      return 'Erro'
    default:
      return 'Rascunho'
  }
}

function metaAdsUrl(connection: SocialConnection | null) {
  const raw = connection?.ad_account_id?.replace(/^act_/, '')
  return raw
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${raw}`
    : 'https://adsmanager.facebook.com/'
}

function ConnectIcons() {
  return (
    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1877F2]/10 text-4xl">
      <span aria-hidden="true">f</span>
      <span className="-ml-1 text-3xl" aria-hidden="true">◎</span>
    </div>
  )
}

export function MarketingClient({
  connection,
  initialCampaigns,
  storeName,
  storeCity,
  storePhone,
  publicMenuUrl,
}: {
  connection: SocialConnection | null
  initialCampaigns: AdCampaign[]
  storeName: string
  storeCity: string
  storePhone: string
  publicMenuUrl: string
}) {
  const [currentConnection, setCurrentConnection] = useState(connection)
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [tab, setTab] = useState<'boost' | 'campaigns'>('boost')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [posts, setPosts] = useState<InstagramPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [tokenExpired, setTokenExpired] = useState(
    !!connection?.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()
  )
  const [creating, setCreating] = useState(false)
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null)

  const [objective, setObjective] = useState('MESSAGES')
  const [dailyBudget, setDailyBudget] = useState('6,00')
  const [startDate, setStartDate] = useState(todayDate())
  const [endDate, setEndDate] = useState(plusDays(7))
  const [targetCity, setTargetCity] = useState(storeCity)
  const [targetRadiusKm, setTargetRadiusKm] = useState(10)
  const [ageMin, setAgeMin] = useState(18)
  const [ageMax, setAgeMax] = useState(65)
  const [gender, setGender] = useState<'all' | 'male' | 'female'>('all')

  const dailyBudgetNumber = useMemo(() => {
    const n = Number(dailyBudget.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }, [dailyBudget])

  const totalBudget = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00`)
    const end = new Date(`${endDate}T00:00:00`)
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    return days * Math.max(0, dailyBudgetNumber)
  }, [dailyBudgetNumber, endDate, startDate])

  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => {
        acc.spent += Number(c.spent || 0)
        acc.reach += Number(c.reach || 0)
        acc.clicks += Number(c.clicks || 0)
        if (c.status === 'active') acc.active += 1
        return acc
      },
      { spent: 0, reach: 0, clicks: 0, active: 0 }
    )
  }, [campaigns])

  useEffect(() => {
    setCurrentConnection(connection)
    setCampaigns(initialCampaigns)
  }, [connection, initialCampaigns])

  function handleTokenExpired() {
    setTokenExpired(true)
    setError('Sua conexão com o Meta expirou. Reconecte para continuar.')
  }

  function connectMeta() {
    window.location.href = '/api/marketing/oauth/start'
  }

  async function disconnectMeta() {
    setError(null)
    const res = await fetch('/api/marketing/oauth/disconnect', { method: 'POST' })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      setError(json.error || 'Não foi possível desconectar.')
      return
    }
    setCurrentConnection(null)
    setSuccess('Conta desconectada.')
  }

  async function loadPosts() {
    setError(null)
    setPostsLoading(true)
    try {
      const res = await fetch('/api/marketing/posts')
      const json = (await res.json().catch(() => ({}))) as {
        posts?: InstagramPost[]
        error?: string
      }
      if (!res.ok) {
        if (json.error === 'token_expired') handleTokenExpired()
        else setError(json.error || 'Não foi possível buscar posts.')
        return
      }
      setPosts(json.posts ?? [])
      setStep(2)
    } finally {
      setPostsLoading(false)
    }
  }

  async function createCampaign() {
    if (!selectedPost || creating) return
    if (dailyBudgetNumber < 6) {
      setError('O orçamento diário mínimo é R$ 6,00.')
      return
    }
    setCreating(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/marketing/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'boost',
          postId: selectedPost.id,
          postThumbnailUrl: selectedPost.thumbnail_url,
          postType: selectedPost.media_type,
          objective,
          dailyBudget: dailyBudgetNumber,
          startDate,
          endDate,
          targetCity,
          targetRadiusKm,
          ageMin,
          ageMax,
          gender,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        campaign_id?: string
      }
      if (!res.ok) {
        if (json.error === 'token_expired') handleTokenExpired()
        else setError(json.error || 'Não foi possível criar anúncio.')
        return
      }
      setSuccess('Anúncio criado na Meta.')
      setTab('campaigns')
      window.location.reload()
    } finally {
      setCreating(false)
    }
  }

  async function updateCampaignStatus(campaign: AdCampaign) {
    const next = campaign.status === 'active' ? 'paused' : 'active'
    setBusyCampaignId(campaign.id)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaign.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        if (json.error === 'token_expired') handleTokenExpired()
        else setError(json.error || 'Não foi possível atualizar campanha.')
        return
      }
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, status: next } : c)))
    } finally {
      setBusyCampaignId(null)
    }
  }

  function duplicateCampaign(campaign: AdCampaign) {
    setSelectedPost({
      id: campaign.post_id || '',
      media_type: campaign.post_type || 'IMAGE',
      media_url: campaign.post_thumbnail_url,
      thumbnail_url: campaign.post_thumbnail_url,
      caption: campaign.name,
      timestamp: null,
    })
    setObjective(campaign.objective || 'MESSAGES')
    setDailyBudget(String(campaign.daily_budget || 6).replace('.', ','))
    setStartDate(todayDate())
    setEndDate(plusDays(7))
    setTargetCity(campaign.target_city || storeCity)
    setTargetRadiusKm(campaign.target_radius_km || 10)
    setAgeMin(campaign.target_age_min || 18)
    setAgeMax(campaign.target_age_max || 65)
    setGender((campaign.target_gender as 'all' | 'male' | 'female') || 'all')
    setTab('boost')
    setStep(3)
  }

  if (!currentConnection) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-3xl border border-[var(--card-border)] bg-white p-8 text-center shadow-sm">
          <ConnectIcons />
          <h1 className="mt-5 font-brand text-2xl font-bold text-[#1a1614]">
            Conecte sua conta para impulsionar
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7280]">
            Vincule sua Página Facebook e crie anúncios direto pelo Vyria — sem sair do sistema.
          </p>
          <button
            type="button"
            onClick={connectMeta}
            className="mt-7 inline-flex items-center justify-center rounded-xl bg-[#1877F2] px-5 py-3 text-sm font-bold text-white shadow-md shadow-[#1877F2]/25 hover:brightness-105"
          >
            Conectar com Facebook/Instagram
          </button>
          <p className="mx-auto mt-4 max-w-md text-xs leading-5 text-[#6b7280]">
            Você precisa ser administrador da Página Facebook. Se tiver Instagram ligado à página, o Vyria tenta mostrar o @; os posts vêm da página.
          </p>
          {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FCAF45] text-lg font-black text-white">
            IG
          </div>
          <div>
            <h1 className="font-brand text-2xl font-bold text-[#1a1614]">Marketing</h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              {storeName} · {currentConnection.page_name || 'Página Meta'}
              {currentConnection.instagram_username
                ? ` · @${currentConnection.instagram_username}`
                : ''}
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                Conectado
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void disconnectMeta()}
          className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb]"
        >
          Desconectar
        </button>
      </div>

      {tokenExpired ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>Sua conexão com o Meta expirou. Reconecte para continuar.</span>
          <button type="button" onClick={connectMeta} className="rounded-xl bg-amber-900 px-4 py-2 font-bold text-white">
            Reconectar
          </button>
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('boost')}
          className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'boost' ? 'bg-[var(--dash-primary)] text-white' : 'bg-white text-[#374151] ring-1 ring-[var(--card-border)]'}`}
        >
          Impulsionar
        </button>
        <button
          type="button"
          onClick={() => setTab('campaigns')}
          className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'campaigns' ? 'bg-[var(--dash-primary)] text-white' : 'bg-white text-[#374151] ring-1 ring-[var(--card-border)]'}`}
        >
          Campanhas
        </button>
      </div>

      {tab === 'boost' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-3xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#9ca3af]">Passo {step} de 3</p>
                <h2 className="mt-1 text-xl font-bold text-[#1a1614]">
                  {step === 1 ? 'Como quer criar seu anúncio?' : step === 2 ? 'Escolha um post' : 'Configure seu anúncio'}
                </h2>
              </div>
              {step > 1 ? (
                <button type="button" onClick={() => setStep((step - 1) as 1 | 2)} className="text-sm font-semibold text-[#6b7280]">
                  Voltar
                </button>
              ) : null}
            </div>

            {step === 1 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void loadPosts()}
                  disabled={postsLoading}
                  className="rounded-2xl border border-[#f97316] bg-orange-50 p-5 text-left transition hover:shadow-md disabled:opacity-60"
                >
                  <span className="text-3xl">◎</span>
                  <p className="mt-4 text-lg font-bold text-[#1a1614]">Usar postagem existente</p>
                  <p className="mt-1 text-sm text-[#6b7280]">Escolha um post da sua Página Facebook para impulsionar</p>
                  <span className="mt-4 inline-flex rounded-full bg-[#f97316] px-3 py-1 text-xs font-bold text-white">
                    {postsLoading ? 'Buscando posts...' : 'Selecionar'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled
                  className="rounded-2xl border border-dashed border-[var(--card-border)] bg-[#fafafa] p-5 text-left opacity-70"
                >
                  <span className="text-3xl">⇧</span>
                  <p className="mt-4 text-lg font-bold text-[#1a1614]">Enviar nova mídia</p>
                  <p className="mt-1 text-sm text-[#6b7280]">Fluxo preparado, aguardando aprovação da Meta</p>
                  <span className="mt-4 inline-flex rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-700">
                    Em breve
                  </span>
                </button>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                {posts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-8 text-center text-sm text-[#6b7280]">
                    Nenhum post encontrado na Página Facebook conectada.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {posts.map((post) => {
                      const selected = selectedPost?.id === post.id
                      return (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setSelectedPost(post)}
                          className={`overflow-hidden rounded-2xl border bg-white text-left transition ${selected ? 'border-[#f97316] ring-2 ring-[#f97316]/30' : 'border-[var(--card-border)] hover:shadow-sm'}`}
                        >
                          <div className="relative aspect-square bg-[#f3f4f6]">
                            {post.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" />
                            ) : null}
                            <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
                              {mediaBadge(post.media_type)}
                            </span>
                            {selected ? (
                              <span className="absolute right-2 top-2 rounded-full bg-[#f97316] px-2 py-1 text-xs font-bold text-white">✓</span>
                            ) : null}
                          </div>
                          <div className="p-3">
                            <p className="text-xs font-semibold text-[#6b7280]">
                              {post.timestamp ? dateFmt.format(new Date(post.timestamp)) : 'Sem data'}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm text-[#1a1614]">
                              {post.caption?.slice(0, 50) || 'Post sem legenda'}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!selectedPost}
                    onClick={() => setStep(3)}
                    className="rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Objetivo</span>
                  <select value={objective} onChange={(e) => setObjective(e.target.value)} className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm">
                    <option value="MESSAGES">Mensagens no WhatsApp</option>
                    <option value="REACH">Mais alcance</option>
                    <option value="PROFILE_VISITS">Visitas ao perfil</option>
                    <option value="CONVERSIONS">Conversões no site</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Orçamento diário (mín. R$ 6,00)</span>
                  <input value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm" placeholder="6,00" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Data início</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Data fim</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm" />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Cidade</span>
                  <input value={targetCity} onChange={(e) => setTargetCity(e.target.value)} className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm" placeholder="Ex.: Goiânia" />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Raio: {targetRadiusKm} km</span>
                  <input type="range" min={1} max={50} value={targetRadiusKm} onChange={(e) => setTargetRadiusKm(Number(e.target.value))} className="w-full" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Idade mínima</span>
                    <input type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Idade máxima</span>
                    <input type="number" min={ageMin} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm" />
                  </label>
                </div>
                <div className="md:col-span-2">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#6b7280]">Gênero</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', 'Todos'],
                      ['male', 'Masculino'],
                      ['female', 'Feminino'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setGender(id as 'all' | 'male' | 'female')}
                        className={`rounded-full px-4 py-2 text-sm font-bold ${gender === id ? 'bg-[var(--dash-primary)] text-white' : 'bg-[#f3f4f6] text-[#374151]'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end md:col-span-2">
                  <button
                    type="button"
                    onClick={() => void createCampaign()}
                    disabled={creating || !selectedPost}
                    className="rounded-xl bg-[var(--dash-primary)] px-5 py-3 text-sm font-bold text-white shadow-md shadow-[var(--dash-primary)]/25 disabled:opacity-50"
                  >
                    {creating ? 'Criando anúncio...' : 'Criar anúncio'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="rounded-3xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-[#1a1614]">Resumo do anúncio</p>
            <div className="mt-4 overflow-hidden rounded-2xl bg-[#f3f4f6]">
              {selectedPost?.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedPost.thumbnail_url} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-sm text-[#9ca3af]">Selecione um post</div>
              )}
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-[#6b7280]">Objetivo</dt><dd className="font-semibold text-[#1a1614]">{objective}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#6b7280]">Total estimado</dt><dd className="font-semibold text-[#1a1614]">{money.format(totalBudget)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#6b7280]">Período</dt><dd className="font-semibold text-[#1a1614]">{startDate} → {endDate}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#6b7280]">Localização</dt><dd className="font-semibold text-[#1a1614]">{targetCity || 'Brasil'} · {targetRadiusKm} km</dd></div>
            </dl>
            <div className="mt-5 rounded-2xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">
              Boost de post existente está habilitado. Campanha com mídia nova fica bloqueada até aprovação da Meta.
              {objective === 'MESSAGES' && storePhone ? ` WhatsApp pré-configurado: ${storePhone}.` : ''}
              {publicMenuUrl ? ` Link da loja: ${publicMenuUrl}.` : ''}
            </div>
          </aside>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricCard label="Total investido" value={money.format(totals.spent)} />
            <MetricCard label="Total alcance" value={String(totals.reach)} />
            <MetricCard label="Total cliques" value={String(totals.clicks)} />
            <MetricCard label="Campanhas ativas" value={String(totals.active)} />
          </div>
          <div className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#fafafa] text-xs uppercase tracking-wide text-[#6b7280]">
                  <tr>
                    <th className="px-4 py-3">Thumb</th>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Investido</th>
                    <th className="px-4 py-3">Alcance</th>
                    <th className="px-4 py-3">Cliques</th>
                    <th className="px-4 py-3">Resultado</th>
                    <th className="px-4 py-3">Período</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <div className="h-12 w-12 overflow-hidden rounded-xl bg-[#f3f4f6]">
                          {c.post_thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.post_thumbnail_url} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#1a1614]">{c.name}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${statusBadge(c.status)}`}>{statusLabel(c.status)}</span></td>
                      <td className="px-4 py-3">{money.format(Number(c.spent || 0))}</td>
                      <td className="px-4 py-3">{c.reach || 0}</td>
                      <td className="px-4 py-3">{c.clicks || 0}</td>
                      <td className="px-4 py-3">{c.messages ? `${c.messages} mensagens` : `${c.impressions || 0} impressões`}</td>
                      <td className="px-4 py-3">{c.start_date || '—'} → {c.end_date || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void updateCampaignStatus(c)} disabled={busyCampaignId === c.id || c.status === 'error'} className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                            {c.status === 'active' ? 'Pausar' : 'Ativar'}
                          </button>
                          <button type="button" onClick={() => duplicateCampaign(c)} className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-bold">Duplicar</button>
                          <a href={metaAdsUrl(currentConnection)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-bold">Ver no Meta</a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-[#6b7280]">
                        Nenhuma campanha criada ainda.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-[#9ca3af]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#1a1614]">{value}</p>
    </div>
  )
}
