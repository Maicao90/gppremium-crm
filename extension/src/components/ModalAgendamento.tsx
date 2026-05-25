import { useState, useEffect, useRef } from "react"

// Componente de Avatar Premium com fallback elegante para iniciais e gradientes estéticos
function AvatarContato({ nome, foto }: { nome: string; foto?: string }) {
  const [imgError, setImgError] = useState(false)

  const obterIniciais = (name: string) => {
    if (!name) return '?'
    const partes = name.trim().split(/\s+/)
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase()
    }
    return partes[0].substring(0, 2).toUpperCase()
  }

  const obterCorAvatar = (name: string) => {
    const cores = [
      'bg-gradient-to-br from-indigo-500 to-purple-600',
      'bg-gradient-to-br from-blue-500 to-indigo-600',
      'bg-gradient-to-br from-emerald-500 to-teal-600',
      'bg-gradient-to-br from-rose-500 to-pink-600',
      'bg-gradient-to-br from-amber-500 to-orange-600',
      'bg-gradient-to-br from-cyan-500 to-blue-600',
      'bg-gradient-to-br from-fuchsia-500 to-pink-600',
      'bg-gradient-to-br from-teal-500 to-emerald-600'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index = Math.abs(hash) % cores.length
    return cores[index]
  }

  if (foto && !imgError) {
    return (
      <img 
        src={foto} 
        alt={nome} 
        className="w-9 h-9 rounded-full object-cover shadow-sm border border-gray-100 flex-shrink-0"
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-white text-[10px] tracking-normal select-none shadow-sm flex-shrink-0 ${obterCorAvatar(nome)}`}>
      {obterIniciais(nome)}
    </div>
  )
}

export default function ModalAgendamento({ onClose, onSuccess, usuarioId, contatoNome = "", contatoNumero = "", contatosDisponiveis = [] }) {
  const [localContatos, setLocalContatos] = useState(contatosDisponiveis)
  const typingTimeout = useRef(null)
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e) => {
      if (e.source !== window) return
      if (e.data?.type === "CRM_LIVE_SEARCH_RESULTS" && e.data.results) {
        setLocalContatos(prev => {
          const novos = [...prev]
          e.data.results.forEach((r) => {
            const indexExistente = novos.findIndex(c => c.nome === r.nome)
            if (indexExistente !== -1) {
              if (r.foto && !novos[indexExistente].foto) {
                novos[indexExistente] = { ...novos[indexExistente], foto: r.foto }
              }
            } else {
              novos.push(r)
            }
          })
          return novos
        })
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  // Fecha o dropdown ao clicar fora do componente
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [])

  // Helper para obter a data local no formato YYYY-MM-DD
  const getTodayDate = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Helper para obter a hora local no formato HH:MM
  const getTodayTime = () => {
    const today = new Date()
    const hours = String(today.getHours()).padStart(2, '0')
    const minutes = String(today.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }

  const [mensagem, setMensagem] = useState("")
  const [tipoAgendamento, setTipoAgendamento] = useState("relativo")
  const [minutos, setMinutos] = useState("30")
  const [dataExata, setDataExata] = useState(getTodayDate())
  const [horaExata, setHoraExata] = useState(getTodayTime())
  const [numero, setNumero] = useState(contatoNumero)
  const [nomeCliente, setNomeCliente] = useState(contatoNome || "Manual")

  // Atualiza os dados do contato quando as props mudarem
  useEffect(() => {
    setNumero(contatoNumero)
    setNomeCliente(contatoNome || "Manual")
  }, [contatoNome, contatoNumero])

  // Calcula a data de previsão para o modo relativo
  const [previsao, setPrevisao] = useState("")

  useEffect(() => {
    if (minutos) {
      const date = new Date(Date.now() + parseInt(minutos) * 60000)
      const formatado = date.toLocaleString('pt-BR', { 
        weekday: 'short', 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })
      setPrevisao(formatado)
    }
  }, [minutos])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!numero && !nomeCliente) {
      alert("Por favor, digite o nome do contato ou o número.")
      return
    }

    let enviarEm;
    if (tipoAgendamento === "relativo") {
      enviarEm = new Date(Date.now() + parseInt(minutos) * 60000).toISOString()
    } else {
      enviarEm = new Date(`${dataExata}T${horaExata}:00`).toISOString()
    }

    // Como agora o disparo ocorre direto pelo servidor (Baileys), o servidor não tem acesso
    // ao localStorage do navegador. Portanto, injetamos a assinatura na mensagem no momento da CRIAÇÃO do agendamento.
    let mensagemFinal = mensagem;
    const usarAssinaturaRobo = localStorage.getItem("crm_usar_assinatura") === "true"
    const nomeAtendente = localStorage.getItem("crm_nome_atendente") || ""
    if (usarAssinaturaRobo && nomeAtendente) {
      mensagemFinal = `*${nomeAtendente}:*\n${mensagem}`
    }

    // Helper de normalização local robusto para números brasileiros
    const normalizarNumero = (num: string): string => {
      let limpo = num.replace(/\D/g, '')
      if (limpo && (limpo.length === 10 || limpo.length === 11) && !limpo.startsWith('55')) {
        limpo = '55' + limpo
      }
      return limpo || num
    }

    // Se o usuário digitou apenas o nome e não sabe o número, passamos o nome para o RPA pesquisar na lupa
    const identificador = numero ? normalizarNumero(numero) : nomeCliente

    const payload = {
      cliente: (nomeCliente && nomeCliente !== "Manual") ? nomeCliente : "Manual",
      numero: identificador,
      mensagem: mensagemFinal,
      enviarEm,
      criadoPorId: usuarioId,
      cancelarSeResponder: false
    }

    try {
      const response = await fetch('https://crm.marleysupermecado.com.br:3000/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erro no servidor (${response.status})`)
      }

      if (onSuccess) onSuccess();
      onClose()
    } catch (err: any) {
      console.error("Erro ao agendar:", err)
      const msgErro = err.message || "Erro desconhecido"
      if (err instanceof TypeError && err.message.includes("fetch")) {
        alert("Erro ao agendar: Não foi possível conectar ao servidor. Por favor, certifique-se de que o backend está rodando em HTTPS (porta 3000).")
      } else {
        alert(`Erro ao agendar: ${msgErro}`)
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[999999] backdrop-blur-sm" style={{fontFamily: 'Inter, sans-serif'}}>
      <div className="bg-white rounded-[20px] shadow-2xl w-[520px] max-h-[90vh] flex flex-col text-gray-800 overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-start p-6 pb-4 border-b border-gray-100">
          <div className="flex gap-3 items-center">
            <div className="bg-[#00a884] rounded-full p-2 text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 leading-tight">Agendar Mensagem</h2>
              <p className="text-sm text-gray-500 flex items-center gap-1 font-medium mt-0.5">
                <span>📱</span> {nomeCliente || 'Novo Contato'} {numero && `(${numero})`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Conteúdo rolável */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 scrollbar-thin">
              {contatosDisponiveis && contatosDisponiveis.length > 0 && (
                <div className="bg-green-50/50 p-3.5 rounded-xl border border-green-100 flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[#00a884] uppercase tracking-wider flex items-center gap-1">
                    <span>📋</span> Dica: Digite o nome ou número abaixo para pesquisar
                  </label>
                  <p className="text-xs text-green-700">Sua agenda de contatos foi carregada. Basta digitar para filtrar.</p>
                </div>
              )}

            {/* Campo 1: Nome (Pesquisa com Dropdown Customizado) */}
            <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100 relative" ref={dropdownRef}>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nome do Contato</label>
              
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Ex: Maicon" 
                  className="w-full border border-gray-200 rounded-lg p-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884] focus:border-transparent transition text-gray-800 bg-white font-medium shadow-sm"
                  value={nomeCliente === "Manual" ? "" : nomeCliente}
                  onFocus={() => setDropdownAberto(true)}
                  onChange={(e) => {
                    const val = e.target.value
                    setNomeCliente(val)
                    setDropdownAberto(true)
 
                    // Trigger live search
                    if (typingTimeout.current) clearTimeout(typingTimeout.current)
                    typingTimeout.current = setTimeout(() => {
                      if (val.trim().length >= 2) {
                        window.postMessage({ type: "CRM_LIVE_SEARCH", query: val.trim() }, "*")
                      }
                    }, 800)
                  }}
                  required
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setDropdownAberto(!dropdownAberto)
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition p-1"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
 
              {/* Dropdown Flutuante Customizado */}
              {dropdownAberto && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-gray-150 rounded-xl shadow-2xl z-[9999999] max-h-64 overflow-y-auto overflow-x-hidden flex flex-col divide-y divide-gray-50">
                  
                  {/* Se a busca estiver vazia, mostramos os pré-contatos (Contatos Frequentes/Recentes) */}
                  {(!nomeCliente || nomeCliente === "Manual") ? (
                    <>
                      <div className="bg-gray-50/70 px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100">
                        <span>👥</span> Contatos Frequentes / Recentes
                      </div>
                      
                      {localContatos && localContatos.slice(0, 8).map((c: any, idx: number) => (
                        <button
                          key={`rec-${idx}`}
                          type="button"
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition flex items-center gap-3 active:bg-gray-100"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setNomeCliente(c.nome)
                            setNumero(c.numero || "")
                            setDropdownAberto(false)
                          }}
                        >
                          <AvatarContato nome={c.nome} foto={c.foto} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate leading-snug">{c.nome}</p>
                            <p className="text-[11px] text-gray-400 font-medium mt-0.5">{c.numero ? `+${c.numero}` : 'Sem número'}</p>
                          </div>
                        </button>
                      ))}
                      
                      {(!localContatos || localContatos.length === 0) && (
                        <div className="px-4 py-4 text-center text-xs text-gray-400 font-medium">
                          Nenhum contato recente localizado. Digite o nome para pesquisar.
                        </div>
                      )}
                    </>
                  ) : (
                    // Se o usuário digitou, mostramos os filtrados
                    <>
                      {(() => {
                        const termo = nomeCliente.toLowerCase().trim()
                        const filtrados = localContatos.filter((c: any) => 
                          c.nome.toLowerCase().includes(termo) || 
                          (c.numero && c.numero.includes(termo))
                        )
 
                        if (filtrados.length === 0) {
                          return (
                            <div className="px-4 py-4 text-center flex flex-col gap-2">
                              <span className="text-xs text-gray-400 font-medium">Nenhum contato encontrado para "{nomeCliente}"</span>
                              <button
                                type="button"
                                className="mx-auto text-xs text-[#00a884] hover:text-[#008f6f] font-bold underline cursor-pointer"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  // Mantém o nome manual e fecha
                                  setDropdownAberto(false)
                                }}
                              >
                                Usar "{nomeCliente}" como contato manual
                              </button>
                            </div>
                          )
                        }
 
                        return (
                          <>
                            <div className="bg-gray-50/70 px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between border-b border-gray-100">
                              <span>🔍 Resultados da Busca</span>
                              <span className="text-[9px] bg-green-50 text-[#00a884] px-2 py-0.5 rounded-full font-bold">{filtrados.length}</span>
                            </div>
                            
                            {filtrados.map((c: any, idx: number) => (
                              <button
                                key={`fil-${idx}`}
                                type="button"
                                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition flex items-center gap-3 active:bg-gray-100"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  setNomeCliente(c.nome)
                                  setNumero(c.numero || "")
                                  setDropdownAberto(false)
                                }}
                              >
                                <AvatarContato nome={c.nome} foto={c.foto} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-gray-800 truncate leading-snug">{c.nome}</p>
                                  <p className="text-[11px] text-gray-400 font-medium mt-0.5">{c.numero ? `+${c.numero}` : 'Sem número'}</p>
                                </div>
                              </button>
                            ))}
                          </>
                        )
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Campo 2: Número do Cliente */}
            <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wider">Número do WhatsApp</label>
                <input 
                  type="text" 
                  placeholder="Se não souber o número, o robô buscará pelo nome." 
                  className="w-full border border-gray-200 bg-[#f8f9fa] p-3 rounded-xl focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] text-gray-700 font-semibold text-xs"
                  value={numero} 
                  onChange={e => setNumero(e.target.value)} 
                />
                {nomeCliente && nomeCliente !== "Manual" && numero && (
                  <div className="mt-2 bg-[#e8f5f0] text-[#00a884] px-3.5 py-2.5 rounded-xl border border-green-150 text-xs font-bold flex items-center gap-2 animate-pulse shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00a884] animate-ping"></span>
                    <span>✓ Contato pronto para agendamento</span>
                  </div>
                )}
              </div>

            {/* Mensagem */}
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block uppercase tracking-wider">Mensagem</label>
              <textarea 
                placeholder="Digite sua mensagem..." 
                className="w-full border border-gray-300 p-3 rounded-xl min-h-[120px] focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] resize-none text-gray-700"
                value={mensagem} onChange={e => setMensagem(e.target.value)} required
              />
              <div className="text-right text-xs text-gray-400 mt-1">{mensagem.length} / 4096</div>
            </div>
            
            {/* Quando Enviar */}
            <div>
              <label className="text-xs font-bold text-gray-500 mb-2 block uppercase tracking-wider">Quando Enviar</label>
              
              <div className="flex bg-[#f0f2f5] p-1 rounded-xl mb-4">
                <button 
                  type="button"
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition ${tipoAgendamento === 'relativo' ? 'bg-[#00a884] shadow text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => setTipoAgendamento('relativo')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Relativo
                </button>
                <button 
                  type="button"
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition ${tipoAgendamento === 'exato' ? 'bg-[#00a884] shadow text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => setTipoAgendamento('exato')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Data e Hora
                </button>
              </div>

              {tipoAgendamento === 'relativo' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      className="border border-gray-200 bg-[#f8f9fa] p-3 rounded-xl w-24 text-center font-bold text-lg focus:outline-none focus:border-[#00a884]"
                      value={minutos} onChange={e => setMinutos(e.target.value)}
                    />
                    <div className="border border-gray-200 bg-[#f8f9fa] p-3 rounded-xl flex-1 flex items-center text-gray-600">
                      Minutos
                    </div>
                  </div>
                  <div className="bg-[#e8f5f0] text-[#00a884] px-4 py-2 rounded-lg text-sm flex items-center gap-2 font-medium">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {previsao}
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input 
                    type="date" 
                    className="border border-gray-200 bg-[#f8f9fa] p-3 rounded-xl flex-1 focus:outline-none focus:border-[#00a884] text-gray-700"
                    value={dataExata} onChange={e => setDataExata(e.target.value)} required={tipoAgendamento === 'exato'}
                  />
                  <input 
                    type="time" 
                    className="border border-gray-200 bg-[#f8f9fa] p-3 rounded-xl w-32 focus:outline-none focus:border-[#00a884] text-gray-700"
                    value={horaExata} onChange={e => setHoraExata(e.target.value)} required={tipoAgendamento === 'exato'}
                  />
                </div>
              )}
            </div>


          </div>

          {/* Botoes Footer fixados */}
          <div className="flex justify-end items-center p-6 pt-4 border-t border-gray-100 gap-3 bg-gray-50">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg font-bold text-gray-500 hover:bg-gray-200 transition text-sm">
              Cancelar
            </button>
            <button type="submit" className="bg-[#00a884] hover:bg-[#008f6f] text-white px-6 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Agendar
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
