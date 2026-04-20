import { redirect } from 'next/navigation'

/** Detalhe do lojista abre no drawer em /admin/lojistas */
export default function AdminLojistaDetailRedirect() {
  redirect('/admin/lojistas')
}
