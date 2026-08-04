import Link from 'next/link'
import { getVyriaLegalEntity } from '@/lib/vyria-legal-entity'

const TERMS_VERSION = '2026-08'
const LAST_UPDATED_LABEL = '4 de agosto de 2026'

type Section = {
  id: string
  title: string
  paragraphs: string[]
}

export default function TermosPage() {
  const vyria = getVyriaLegalEntity()
  const contratada =
    vyria.razaoSocial && vyria.cnpjLabel
      ? `${vyria.razaoSocial}, inscrita no CNPJ sob o n.º ${vyria.cnpjLabel}`
      : vyria.razaoSocial
        ? vyria.razaoSocial
        : 'a titular da plataforma Vyria Delivery'
  const emailJuridico = vyria.emailJuridico || null
  const foro =
    vyria.foroComarca ||
    'comarca do domicílio da contratada, salvo disposição específica em contrato escrito'

  const sections: Section[] = [
    {
      id: 'aceitacao',
      title: '1. Aceitação dos Termos',
      paragraphs: [
        `Ao aceder, criar conta, contratar planos ou utilizar a plataforma Vyria Delivery («Plataforma»), o utilizador («Utilizador» ou «Lojista») declara ter lido, compreendido e aceite integralmente estes Termos de Serviço («Termos»), bem como a política de privacidade e as regras operacionais aplicáveis.`,
        'Se não concordar com qualquer disposição, não deve utilizar a Plataforma. O uso continuado após alterações constitui aceitação da versão atualizada.',
      ],
    },
    {
      id: 'definicoes',
      title: '2. Definições',
      paragraphs: [
        '«Vyria» ou «nós»: a entidade prestadora do serviço de software, identificada nestes Termos.',
        '«Plataforma»: o conjunto de aplicações web, APIs, painéis, cardápios digitais, integrações (incluindo WhatsApp e meios de pagamento quando habilitados) e demais funcionalidades disponibilizadas sob a marca Vyria Delivery.',
        '«Loja»: o estabelecimento ou operação comercial cadastrada pelo Lojista na Plataforma.',
        '«Cliente Final»: consumidor ou utilizador que interage com o cardápio, pedidos ou canais da Loja.',
        '«Conteúdo do Lojista»: dados, textos, imagens, preços, cardápios, políticas da loja e demais informações inseridas ou transmitidas pelo Lojista.',
      ],
    },
    {
      id: 'servico',
      title: '3. Objeto e descrição do serviço',
      paragraphs: [
        'A Vyria presta serviço de software na modalidade SaaS (Software as a Service), destinado a apoiar operações de comércio local — incluindo, conforme o plano contratado, gestão de cardápio digital, pedidos, painel operacional, impressão, fidelidade, automações, integrações e ferramentas correlatas.',
        'A Plataforma é uma ferramenta tecnológica. A Vyria não é parte nas relações de compra e venda, entrega ou prestação de serviços entre o Lojista e o Cliente Final, salvo quando expressamente indicado em funcionalidade específica.',
        'Funcionalidades, limites e canais disponíveis dependem do plano, do modelo de operação da Loja e das configurações ativas. A Vyria pode evoluir, suspender ou descontinuar módulos com aviso razoável, preservando, sempre que possível, a continuidade do serviço essencial contratado.',
      ],
    },
    {
      id: 'cadastro',
      title: '4. Cadastro e conta',
      paragraphs: [
        'O Lojista deve fornecer informações verdadeiras, completas e atualizadas. É responsável pela confidencialidade das credenciais e por toda atividade realizada na sua conta.',
        'A Vyria pode recusar, suspender ou encerrar contas em caso de dados falsos, uso indevido, risco de segurança, incumprimento destes Termos ou determinação legal.',
        'O Lojista deve manter contactos e meios de notificação atualizados para comunicações sobre faturação, segurança e alterações contratuais.',
      ],
    },
    {
      id: 'planos',
      title: '5. Planos, pagamentos e contrato anual',
      paragraphs: [
        'O acesso a funcionalidades pode estar sujeito a planos gratuitos ou pagos, períodos de teste e condições comerciais divulgadas no painel ou em proposta.',
        'Valores, ciclos de cobrança (mensal ou anual) e eventuais descontos são os indicados no momento da contratação. Impostos e encargos legais aplicáveis podem acrescer conforme a legislação.',
        'Em planos com compromisso anual, aplicam-se as cláusulas do contrato de prestação de serviços aceite no painel (incluindo vigência, preço travado e multa por rescisão antecipada, quando prevista). Em caso de conflito entre estes Termos e um contrato anual assinado eletronicamente, prevalece o contrato específico quanto às condições comerciais e de permanência.',
        'A falta de pagamento pode resultar em restrição de funcionalidades, suspensão do acesso ou cancelamento, sem prejuízo da cobrança de valores devidos.',
      ],
    },
    {
      id: 'uso',
      title: '6. Uso aceitável',
      paragraphs: [
        'O Lojista compromete-se a utilizar a Plataforma de forma lícita, ética e compatível com estes Termos, abstendo-se de: (a) violar leis, direitos de terceiros ou normas de proteção de dados; (b) enviar spam, phishing ou comunicações abusivas; (c) tentar obter acesso não autorizado a sistemas, contas ou dados; (d) interferir na disponibilidade ou integridade da Plataforma; (e) utilizar a Plataforma para atividades ilícitas, fraudulentas ou que prejudiquem Clientes Finais ou terceiros.',
        'Integrações com WhatsApp, gateways de pagamento, serviços fiscais ou terceiros estão sujeitas também aos termos e limites desses fornecedores. O Lojista é responsável por obter as autorizações necessárias junto dos seus clientes e canais.',
      ],
    },
    {
      id: 'responsabilidades-lojista',
      title: '7. Responsabilidades do Lojista',
      paragraphs: [
        'O Lojista é o único responsável pelo Conteúdo do Lojista, pela veracidade de preços e disponibilidade de produtos, pela qualidade dos produtos e serviços oferecidos, pelo cumprimento de pedidos, entregas, reembolsos e atendimento ao Cliente Final.',
        'Obrigações fiscais, sanitárias, consumeristas e regulatórias da atividade do Lojista são de sua exclusiva responsabilidade, inclusive emissão de documentos fiscais quando aplicável, ainda que a Plataforma ofereça ferramentas de apoio.',
        'O Lojista deve obter consentimentos e bases legais adequados para tratamento de dados de Clientes Finais e para comunicações (incluindo WhatsApp), nos termos da LGPD e legislação aplicável.',
      ],
    },
    {
      id: 'propriedade',
      title: '8. Propriedade intelectual',
      paragraphs: [
        'A Plataforma, marcas, logótipos, código, design, documentação e demais elementos da Vyria são de titularidade da Vyria ou de licenciantes. Estes Termos não transferem qualquer direito de propriedade intelectual ao Lojista, além de uma licença limitada, não exclusiva e intransferível para uso da Plataforma durante a vigência da conta e do plano.',
        'O Conteúdo do Lojista permanece de sua titularidade (ou de seus licenciantes). O Lojista concede à Vyria licença para hospedar, processar, reproduzir e exibir esse conteúdo na medida necessária à prestação do serviço.',
      ],
    },
    {
      id: 'dados',
      title: '9. Dados pessoais e privacidade (LGPD)',
      paragraphs: [
        'No âmbito da relação com o Lojista, a Vyria trata dados pessoais necessários à operação da conta, faturação, suporte e segurança, na qualidade de controladora ou operadora conforme o contexto.',
        'Quando o Lojista utiliza a Plataforma para tratar dados de Clientes Finais (por exemplo, dados de pedido ou contacto), o Lojista atua tipicamente como controlador desses dados, e a Vyria como operadora, processando-os segundo as instruções do Lojista e as funcionalidades da Plataforma.',
        'O Lojista deve informar os Clientes Finais de forma clara sobre o tratamento de dados realizado pela Loja. Pedidos de titulares e incidentes devem ser tratados de boa-fé, com cooperação razoável entre as partes quando exigido por lei.',
      ],
    },
    {
      id: 'disponibilidade',
      title: '10. Disponibilidade, suporte e alterações',
      paragraphs: [
        'A Vyria envida esforços comercialmente razoáveis para manter a Plataforma disponível e segura, sem garantir disponibilidade ininterrupta ou isenta de erros. Manutenções, atualizações e fatores externos (rede, fornecedores, força maior) podem afetar o serviço.',
        'O suporte é prestado pelos canais oficiais indicados no painel ou comunicações da Vyria, dentro dos horários e níveis compatíveis com o plano contratado.',
        'A Vyria pode atualizar estes Termos. Alterações relevantes serão comunicadas por meios razoáveis (painel, e-mail ou publicação nesta página). A data e a versão no topo deste documento indicam a revisão vigente.',
      ],
    },
    {
      id: 'garantias',
      title: '11. Isenção de garantias',
      paragraphs: [
        'Na máxima extensão permitida pela lei, a Plataforma é fornecida «como está» e «conforme disponível». A Vyria não garante que o serviço atenderá a todos os requisitos do Lojista, nem que será livre de interrupções, vírus ou falhas.',
        'A Vyria não se responsabiliza por decisões comerciais do Lojista, por perdas decorrentes de configuração incorreta, por atos de Clientes Finais ou de terceiros, nem por indisponibilidade de serviços externos (operadoras, WhatsApp, bancos, APIs fiscais, etc.).',
      ],
    },
    {
      id: 'responsabilidade',
      title: '12. Limitação de responsabilidade',
      paragraphs: [
        'Na máxima extensão permitida pela legislação aplicável, a responsabilidade total da Vyria perante o Lojista por danos diretos decorrentes da Plataforma fica limitada ao montante efetivamente pago pelo Lojista à Vyria nos 3 (três) meses anteriores ao evento que deu origem à reclamação, excluídos danos indiretos, lucros cessantes, perda de dados (salvo dever legal específico), danos reputacionais ou punitivos.',
        'Nada nestes Termos exclui responsabilidade que não possa ser limitada por lei, incluindo dolo ou culpa grave quando assim previsto no ordenamento aplicável.',
      ],
    },
    {
      id: 'rescisao',
      title: '13. Suspensão e rescisão',
      paragraphs: [
        'O Lojista pode deixar de utilizar a Plataforma e solicitar o encerramento da conta pelos canais de suporte, observadas condições de planos e contratos anuais vigentes.',
        'A Vyria pode suspender ou encerrar o acesso em caso de incumprimento destes Termos, risco à segurança, ilegalidade, falta de pagamento ou determinação de autoridade competente.',
        'Após o encerramento, o acesso às funcionalidades cessa. A Vyria pode reter dados pelo tempo necessário ao cumprimento de obrigações legais, defesa de direitos ou resolução de disputas, e eliminar ou anonimizar dados quando aplicável.',
      ],
    },
    {
      id: 'geral',
      title: '14. Disposições gerais',
      paragraphs: [
        'Se qualquer cláusula for considerada inválida, as restantes permanecem em vigor. A tolerância quanto a incumprimentos não constitui renúncia de direitos.',
        'Estes Termos constituem o acordo geral sobre o uso da Plataforma, sem prejuízo de contratos específicos (incluindo contrato anual), ordens de serviço ou aditivos celebrados por escrito ou por assinatura eletrónica no painel.',
        `Comunicações jurídicas podem ser dirigidas ao e-mail ${emailJuridico ? emailJuridico : 'indicado no painel ou nos canais oficiais de suporte da Vyria'}.`,
      ],
    },
    {
      id: 'foro',
      title: '15. Lei aplicável e foro',
      paragraphs: [
        'Estes Termos regem-se pelas leis da República Federativa do Brasil.',
        `Fica eleito o foro da ${foro}, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir controvérsias oriundas destes Termos, sem prejuízo de foro previsto em contrato específico entre as partes.`,
      ],
    },
  ]

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-vyria-plum">
        Documento jurídico
      </p>
      <h1 className="font-brand mt-3 text-3xl font-bold tracking-tight text-vyria-navy sm:text-4xl">
        Termos de Serviço
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-vyria-navy-muted">
        Versão {TERMS_VERSION} · Atualizado em {LAST_UPDATED_LABEL}
      </p>
      <p className="mt-6 text-base leading-relaxed text-vyria-navy-muted">
        Estes Termos regulam o uso da plataforma{' '}
        <span className="font-semibold text-vyria-navy">Vyria Delivery</span>,
        disponibilizada por {contratada}.
      </p>

      <nav
        aria-label="Sumário"
        className="mt-10 border-y border-[var(--card-border)] py-6"
      >
        <p className="text-sm font-semibold text-vyria-navy">Sumário</p>
        <ol className="mt-3 columns-1 gap-x-8 space-y-2 text-sm sm:columns-2">
          {sections.map((section) => (
            <li key={section.id} className="break-inside-avoid">
              <a
                href={`#${section.id}`}
                className="font-medium text-vyria-plum hover:text-vyria-orange hover:underline"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="font-brand text-xl font-semibold text-vyria-navy">
              {section.title}
            </h2>
            <div className="mt-3 space-y-3 text-base leading-relaxed text-vyria-navy-muted">
              {section.paragraphs.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-14 text-sm text-vyria-navy-muted">
        Dúvidas sobre estes Termos?{' '}
        {emailJuridico ? (
          <>
            Contacte{' '}
            <a
              href={`mailto:${emailJuridico}`}
              className="font-semibold text-vyria-plum hover:text-vyria-orange"
            >
              {emailJuridico}
            </a>
            .
          </>
        ) : (
          <>Utilize os canais oficiais de suporte da Vyria.</>
        )}
      </p>

      <p className="mt-8">
        <Link
          href="/"
          className="text-sm font-semibold text-vyria-plum hover:text-vyria-orange"
        >
          ← Voltar ao início
        </Link>
      </p>
    </main>
  )
}
