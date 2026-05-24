import { useState, useEffect } from "react"

interface TemplateMensagem {
  id: string
  titulo: string
  texto: string
}

interface MensagensRapidasProps {
  onClose: () => void
  filtroInicial?: string
  onSelectTemplate: (texto: string) => void
}

export default function MensagensRapidas({ onClose, filtroInicial = "", onSelectTemplate }: MensagensRapidasProps) {
  const [templates, setTemplates] = useState<TemplateMensagem[]>([])
  const [busca, setBusca] = useState(filtroInicial)
  const [editando, setEditando] = useState<TemplateMensagem | null>(null)
  
  // Atualiza o estado de busca sempre que o filtro inicial digitado na caixa mudar
  useEffect(() => {
    setBusca(filtroInicial)
  }, [filtroInicial])
  
  // Estado para o formulário de cadastro/edição
  const [mostrarForm, setMostrarForm] = useState(false)
  const [titulo, setTitulo] = useState("")
  const [texto, setTexto] = useState("")

  // Carrega templates do localStorage ao montar o componente
  useEffect(() => {
    const saved = localStorage.getItem("crm_mensagens_rapidas")
    if (saved) {
      try {
        setTemplates(JSON.parse(saved))
      } catch (e) {
        console.error("Erro ao ler mensagens rápidas:", e)
      }
    } else {
      // Templates padrão iniciais para o vendedor ter exemplos de elite
      const defaults: TemplateMensagem[] = [
        {
          id: "default-1",
          titulo: "/boasvindas",
          texto: "Olá! Seja muito bem-vindo à GP Pneus. 🛞 Meu nome é {atendente}. Como posso te ajudar hoje?"
        },
        {
          id: "default-2",
          titulo: "/orcamento",
          texto: "Claro! Para que eu possa gerar o melhor orçamento para você, poderia me informar a medida do pneu que você precisa (ex: 205/55 R16) e a marca de sua preferência? 😊"
        },
        {
          id: "default-3",
          titulo: "/catalogo",
          texto: "Seguem os modelos de pneus de alta performance que temos disponíveis hoje na GP Pneus. Todos com garantia oficial e entrega expressa! 🚀"
        }
      ]
      localStorage.setItem("crm_mensagens_rapidas", JSON.stringify(defaults))
      setTemplates(defaults)
    }
  }, [])

  // Salvar no localStorage sempre que a lista de templates mudar
  const salvarTemplates = (novaLista: TemplateMensagem[]) => {
    localStorage.setItem("crm_mensagens_rapidas", JSON.stringify(novaLista))
    setTemplates(novaLista)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim() || !texto.trim()) return

    // Garante que o atalho comece com barra '/' para facilitar identificação visual
    let tituloFormatado = titulo.trim()
    if (!tituloFormatado.startsWith("/")) {
      tituloFormatado = "/" + tituloFormatado
    }

    if (editando) {
      // Atualiza o existente
      const atualizados = templates.map(t => 
        t.id === editando.id ? { ...t, titulo: tituloFormatado, texto: texto.trim() } : t
      )
      salvarTemplates(atualizados)
      setEditando(null)
    } else {
      // Adiciona novo
      const novo: TemplateMensagem = {
        id: "tpl-" + Date.now(),
        titulo: tituloFormatado,
        texto: texto.trim()
      }
      salvarTemplates([...templates, novo])
    }

    // Reseta form
    setTitulo("")
    setTexto("")
    setMostrarForm(false)
  }

  const handleEditClick = (template: TemplateMensagem) => {
    setEditando(template)
    setTitulo(template.titulo)
    setTexto(template.texto)
    setMostrarForm(true)
  }

  const handleDeletar = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta mensagem pré-definida?")) {
      const atualizados = templates.filter(t => t.id !== id)
      salvarTemplates(atualizados)
    }
  }

  const handleUsarTemplate = (textoOriginal: string) => {
    // Substitui a variável {atendente} se o nome estiver configurado
    const nomeAtendente = localStorage.getItem("crm_nome_atendente") || "Atendente"
    const textoFinal = textoOriginal.replace(/{atendente}/g, nomeAtendente)
    onSelectTemplate(textoFinal)
  }

  // Filtra templates de acordo com a barra de busca
  const templatesFiltrados = templates.filter(t => 
    t.titulo.toLowerCase().includes(busca.toLowerCase()) || 
    t.texto.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div 
      className="fixed inset-y-0 right-[60px] w-[380px] bg-[#f8f9fa] shadow-2xl border-l border-gray-200 flex flex-col z-[9999] transition-all duration-300 ease-in-out"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-[#00a884] text-white p-1.5 rounded-lg shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <path d="M13 8l-2 4h3l-2 4"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-none">Mensagens Pré-definidas</h2>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Templates de Resposta Rápida</span>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition"
          title="Fechar Painel"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Seção principal */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        
        {/* Formulário de Cadastro/Edição (Exibido condicionalmente) */}
        {mostrarForm ? (
          <form onSubmit={handleSubmit} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3 animate-fadeIn">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-[#00a884] uppercase tracking-wider">
                {editando ? "Editar Mensagem" : "Nova Mensagem Rápida"}
              </h3>
              <button 
                type="button" 
                onClick={() => {
                  setMostrarForm(false)
                  setEditando(null)
                  setTitulo("")
                  setTexto("")
                }}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold"
              >
                Cancelar
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Título / Atalho (ex: /preco)</label>
              <input 
                type="text" 
                placeholder="Ex: /orcamento"
                className="border border-gray-200 bg-[#f8f9fa] p-2 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#00a884]"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Texto da Mensagem</label>
              <textarea 
                placeholder="Digite a mensagem pronta..."
                className="border border-gray-200 bg-[#f8f9fa] p-2 rounded-lg text-xs font-semibold text-gray-700 min-h-[90px] focus:outline-none focus:border-[#00a884] resize-none"
                value={texto}
                onChange={e => setTexto(e.target.value)}
                required
              />
              <span className="text-[8px] text-gray-400 italic">Dica: Use <b>{`{atendente}`}</b> para puxar o nome do vendedor configurado automaticamente!</span>
            </div>

            <button 
              type="submit" 
              className="bg-[#00a884] hover:bg-[#008f6f] text-white py-2 rounded-lg font-bold text-xs transition shadow-sm"
            >
              {editando ? "Salvar Alterações" : "Adicionar Mensagem"}
            </button>
          </form>
        ) : (
          /* Botão para abrir formulário de cadastro */
          <button 
            onClick={() => setMostrarForm(true)}
            className="w-full bg-[#e8f5f0] hover:bg-[#d1ebd9] text-[#00a884] py-2.5 rounded-xl font-bold text-xs transition border border-dashed border-[#a3e2c3] flex items-center justify-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nova Mensagem Pré-definida
          </button>
        )}

        {/* Barra de Busca (Apenas se não estiver com o formulário aberto) */}
        {!mostrarForm && (
          <div className="relative">
            <input 
              type="text" 
              placeholder="Buscar mensagem rápida..." 
              className="w-full bg-white border border-gray-200 py-2.5 pl-8 pr-3 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#00a884] shadow-sm"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            <div className="absolute left-2.5 top-3 text-gray-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          </div>
        )}

        {/* Lista de Templates */}
        <div className="flex flex-col gap-3">
          {templatesFiltrados.length > 0 ? (
            templatesFiltrados.map(item => (
              <div 
                key={item.id}
                className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-2 hover:border-[#00a884]/40 transition group"
              >
                <div className="flex justify-between items-center">
                  <span className="bg-[#e8f5f0] text-[#00a884] px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide">
                    {item.titulo}
                  </span>
                  
                  {/* Ações ocultas por padrão, visíveis em hover */}
                  <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition">
                    <button 
                      onClick={() => handleEditClick(item)}
                      className="text-gray-400 hover:text-blue-500 p-0.5 rounded transition"
                      title="Editar mensagem"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleDeletar(item.id)}
                      className="text-gray-400 hover:text-red-500 p-0.5 rounded transition"
                      title="Excluir mensagem"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-600 font-medium leading-relaxed whitespace-pre-wrap">
                  {item.texto}
                </p>

                {/* Botão de Enviar/Injetar */}
                <button 
                  onClick={() => handleUsarTemplate(item.texto)}
                  className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white py-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 mt-1 shadow-sm opacity-90 hover:opacity-100"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  Usar e Focar no Chat
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-8 flex flex-col items-center gap-2">
              <span className="text-3xl">📭</span>
              <p className="text-xs text-gray-400 font-bold">Nenhum template encontrado.</p>
              <span className="text-[10px] text-gray-400 font-medium">Cadastre mensagens prontas para agilizar seus atendimentos!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
