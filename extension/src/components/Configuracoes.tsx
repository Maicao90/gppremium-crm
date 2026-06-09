import { useState, useEffect } from "react"

export default function Configuracoes({ onClose }) {
  const [usuarioLogado, setUsuarioLogado] = useState<any>(() => {
    try {
      const cached = localStorage.getItem("crm_usuario_logado")
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  })

  const handleLogoutClick = () => {
    if (confirm(`Deseja realmente sair da conta de ${usuarioLogado?.nome}?`)) {
      localStorage.removeItem("crm_usuario_logado")
      setUsuarioLogado(null)
      window.location.reload()
    }
  }

  const handleLoginClick = () => {
    window.location.reload()
  }

  const [nomeAtendente, setNomeAtendente] = useState("Atendente")
  const [usarAssinatura, setUsarAssinatura] = useState(false)
  const [usarAssinaturaManual, setUsarAssinaturaManual] = useState(false)
  const [delayAbrirChat, setDelayAbrirChat] = useState("1.5")
  const [delayDigitar, setDelayDigitar] = useState("0.5")
  
  // Estados para as configurações de expediente do backend
  const [expedienteAtivo, setExpedienteAtivo] = useState(false)
  const [expedienteInicio, setExpedienteInicio] = useState("08:00")
  const [expedienteFim, setExpedienteFim] = useState("18:00")
  const [expedienteDias, setExpedienteDias] = useState<number[]>([1, 2, 3, 4, 5]) // Segunda a Sexta por padrão
  
  // Auto Resposta (Carregada do usuário no banco de dados)
  const [autoRespostaAtiva, setAutoRespostaAtiva] = useState(usuarioLogado?.autoRespostaAtiva || false)
  const [autoRespostaMensagem, setAutoRespostaMensagem] = useState(usuarioLogado?.autoRespostaMensagem || "Oi! Sou a Josi 👋\nPor gentileza me diz seu NOME e a medida de PNEUS que você precisa.\n\nHorário de atendimento:\nSegunda a sexta de 08h às 18h\nSábado de 08h às 12h.")

  const [salvoFeedback, setSalvoFeedback] = useState(false)

  // Carrega configurações salvas ao montar o componente
  useEffect(() => {
    const savedNome = localStorage.getItem("crm_nome_atendente")
    const savedAssinatura = localStorage.getItem("crm_usar_assinatura")
    const savedAssinaturaManual = localStorage.getItem("crm_usar_assinatura_manual")
    const savedDelayAbrir = localStorage.getItem("crm_delay_abrir_chat")
    const savedDelayDigitar = localStorage.getItem("crm_delay_digitar")

    if (savedNome) setNomeAtendente(savedNome)
    if (savedAssinatura) setUsarAssinatura(savedAssinatura === "true")
    if (savedAssinaturaManual) setUsarAssinaturaManual(savedAssinaturaManual === "true")
    if (savedDelayAbrir) setDelayAbrirChat(savedDelayAbrir)
    if (savedDelayDigitar) setDelayDigitar(savedDelayDigitar)

    // Carrega configurações de expediente do banco de dados SQLite do servidor
    fetch("https://crm.nailacademyprofissional.com/api/configuracoes")
      .then(res => res.json())
      .then(data => {
        if (data) {
          setExpedienteAtivo(data.expedienteAtivo)
          if (data.expedienteInicio) setExpedienteInicio(data.expedienteInicio)
          if (data.expedienteFim) setExpedienteFim(data.expedienteFim)
          if (data.expedienteDias) {
            setExpedienteDias(data.expedienteDias.split(',').map(Number))
          }
        }
      })
      .catch(err => console.error("Erro ao carregar configurações de expediente do servidor:", err))
  }, [])

  // Exibe um feedback visual rápido temporário para sinalizar salvamento instantâneo
  const dispararFeedbackSalvo = () => {
    setSalvoFeedback(true)
    const t = setTimeout(() => {
      setSalvoFeedback(false)
    }, 1500)
    return () => clearTimeout(t)
  }

  // Função genérica de salvamento das configurações de expediente no backend
  const salvarConfiguracoesBackend = async (payload: {
    expedienteAtivo: boolean
    expedienteInicio: string
    expedienteFim: string
    expedienteDias: string
  }) => {
    try {
      await fetch("https://crm.nailacademyprofissional.com/api/configuracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      dispararFeedbackSalvo()
    } catch (err) {
      console.error("Erro ao sincronizar configurações com backend:", err)
    }
  }

  // Lógica de salvamento instantâneo para cada opção
  const handleUsarAssinaturaChange = (checked: boolean) => {
    setUsarAssinatura(checked)
    localStorage.setItem("crm_usar_assinatura", String(checked))
    dispararFeedbackSalvo()
  }

  const handleUsarAssinaturaManualChange = (checked: boolean) => {
    setUsarAssinaturaManual(checked)
    localStorage.setItem("crm_usar_assinatura_manual", String(checked))
    dispararFeedbackSalvo()
  }

  const handleNomeAtendenteChange = (value: string) => {
    setNomeAtendente(value)
    localStorage.setItem("crm_nome_atendente", value)
  }

  const handleDelayAbrirChange = (value: string) => {
    setDelayAbrirChat(value)
    localStorage.setItem("crm_delay_abrir_chat", value)
    dispararFeedbackSalvo()
  }

  const handleDelayDigitarChange = (value: string) => {
    setDelayDigitar(value)
    localStorage.setItem("crm_delay_digitar", value)
    dispararFeedbackSalvo()
  }

  // Auto-Resposta Backend
  const salvarAutoRespostaBackend = async (ativa: boolean, mensagem: string) => {
    if (!usuarioLogado) return;
    try {
      await fetch(`https://crm.nailacademyprofissional.com/api/usuarios/${usuarioLogado.id}/autoresposta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRespostaAtiva: ativa, autoRespostaMensagem: mensagem })
      });
      // Atualizar no localStorage para manter
      const atualizado = { ...usuarioLogado, autoRespostaAtiva: ativa, autoRespostaMensagem: mensagem };
      localStorage.setItem("crm_usuario_logado", JSON.stringify(atualizado));
      setUsuarioLogado(atualizado);
      dispararFeedbackSalvo();
    } catch (err) {
      console.error("Erro ao salvar auto-resposta:", err);
    }
  }

  const handleAutoRespostaAtivaChange = (checked: boolean) => {
    setAutoRespostaAtiva(checked)
    salvarAutoRespostaBackend(checked, autoRespostaMensagem)
  }

  const handleAutoRespostaMensagemChange = (value: string) => {
    setAutoRespostaMensagem(value)
  }

  const handleBlurAutoResposta = () => {
    salvarAutoRespostaBackend(autoRespostaAtiva, autoRespostaMensagem)
  }

  // Funções para controle de expediente
  const handleExpedienteAtivoChange = (checked: boolean) => {
    setExpedienteAtivo(checked)
    salvarConfiguracoesBackend({
      expedienteAtivo: checked,
      expedienteInicio,
      expedienteFim,
      expedienteDias: expedienteDias.join(',')
    })
  }

  const handleExpedienteInicioChange = (value: string) => {
    setExpedienteInicio(value)
    salvarConfiguracoesBackend({
      expedienteAtivo,
      expedienteInicio: value,
      expedienteFim,
      expedienteDias: expedienteDias.join(',')
    })
  }

  const handleExpedienteFimChange = (value: string) => {
    setExpedienteFim(value)
    salvarConfiguracoesBackend({
      expedienteAtivo,
      expedienteInicio,
      expedienteFim: value,
      expedienteDias: expedienteDias.join(',')
    })
  }

  const handleDiaSemanaToggle = (dia: number) => {
    let novosDias = [...expedienteDias]
    if (novosDias.includes(dia)) {
      if (novosDias.length > 1) { // Garante pelo menos um dia ativo
        novosDias = novosDias.filter(d => d !== dia)
      }
    } else {
      novosDias.push(dia)
    }
    novosDias.sort((a, b) => a - b)
    setExpedienteDias(novosDias)
    salvarConfiguracoesBackend({
      expedienteAtivo,
      expedienteInicio,
      expedienteFim,
      expedienteDias: novosDias.join(',')
    })
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    
    localStorage.setItem("crm_nome_atendente", nomeAtendente)
    localStorage.setItem("crm_usar_assinatura", String(usarAssinatura))
    localStorage.setItem("crm_usar_assinatura_manual", String(usarAssinaturaManual))
    localStorage.setItem("crm_delay_abrir_chat", delayAbrirChat)
    localStorage.setItem("crm_delay_digitar", delayDigitar)

    salvarConfiguracoesBackend({
      expedienteAtivo,
      expedienteInicio,
      expedienteFim,
      expedienteDias: expedienteDias.join(',')
    })
  }

  return (
    <div 
      className="fixed inset-y-0 right-[60px] w-[380px] bg-[#f8f9fa] shadow-2xl border-l border-gray-200 flex flex-col z-[9999] transition-all duration-300 ease-in-out" 
      style={{fontFamily: 'Inter, sans-serif'}}
    >
      {/* Header do Painel */}
      <div className="bg-white border-b border-gray-100 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-[#00a884] text-white p-1.5 rounded-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-none">Configurações</h2>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Ajustes da Automação e CRM</span>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition"
          title="Fechar Painel"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Formulário de Configurações */}
      <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        
        {/* Conta do Vendedor (Autenticação do CRM) */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3">
          <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5" style={{ margin: 0 }}>
            <span>👤</span> Conta do Operador
          </h3>
          {usuarioLogado ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)', width: '32px', height: '32px', borderRadius: '50%' }}>
                  {usuarioLogado.nome ? usuarioLogado.nome.split(' ').map((n: any) => n[0]).slice(0, 2).join('').toUpperCase() : 'OP'}
                </div>
                <div className="flex-1 min-w-0" style={{ textAlign: 'left' }}>
                  <p className="text-xs font-bold text-gray-800 truncate" style={{ margin: 0, fontWeight: 700 }}>{usuarioLogado.nome}</p>
                  <p className="text-[10px] text-gray-400 truncate" style={{ margin: 0 }}>{usuarioLogado.email}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleLogoutClick}
                className="w-full bg-red-50 text-red-500 hover:bg-red-100 text-xs font-bold py-2.5 px-4 rounded-lg border border-red-100 transition flex items-center justify-center gap-1"
                style={{ cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sair da Conta (Logout)
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400 font-semibold italic text-center" style={{ margin: 0 }}>Nenhum operador conectado.</p>
              <button 
                type="button"
                onClick={handleLoginClick}
                className="w-full bg-green-50 text-[#00a884] hover:bg-green-100 text-xs font-bold py-2.5 px-4 rounded-lg border border-green-100 transition flex items-center justify-center gap-1"
                style={{ cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Fazer Login no CRM
              </button>
            </div>
          )}
        </div>
        
        {/* Assinatura das Mensagens */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
          <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
            <span>✍️</span> Assinatura de Mensagens
          </h3>
          
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={usarAssinatura} 
                onChange={e => handleUsarAssinaturaChange(e.target.checked)} 
                className="w-4 h-4 accent-[#00a884] rounded"
              />
              <span className="text-xs font-semibold text-gray-700">Assinar agendamentos do robô</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-gray-50">
              <input 
                type="checkbox" 
                checked={usarAssinaturaManual} 
                onChange={e => handleUsarAssinaturaManualChange(e.target.checked)} 
                className="w-4 h-4 accent-[#00a884] rounded"
              />
              <span className="text-xs font-semibold text-gray-700">Assinar mensagens do vendedor (manual)</span>
            </label>
          </div>

          {(usarAssinatura || usarAssinaturaManual) && (
            <div className="flex flex-col gap-1.5 mt-1 pt-2 border-t border-gray-50">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nome do Atendente / Vendedor</label>
              <input 
                type="text" 
                className="border border-gray-200 bg-[#f8f9fa] p-2.5 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#00a884]"
                value={nomeAtendente}
                onChange={e => handleNomeAtendenteChange(e.target.value)}
                placeholder="Ex: Vendedor Maicon"
                required={usarAssinatura || usarAssinaturaManual}
              />
              <span className="text-[9px] text-gray-400 italic font-medium">As mensagens selecionadas começarão com: <br/><b className="text-gray-600">*{nomeAtendente || 'Nome'}:*</b> em negrito.</span>
            </div>
          )}
        </div>

        {/* Auto-Resposta */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5" style={{ margin: 0 }}>
              <span>💬</span> Mensagem de Auto-Resposta
            </h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={autoRespostaAtiva} 
                onChange={e => handleAutoRespostaAtivaChange(e.target.checked)}
                className="sr-only peer"
                disabled={!usuarioLogado}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00a884]"></div>
            </label>
          </div>
          
          <span className="text-[9px] text-gray-400 -mt-2">
            Se ativado, envia automaticamente a mensagem abaixo para todo novo cliente que mandar mensagem. (Envia apenas 1 vez por cliente)
          </span>

          {autoRespostaAtiva && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-50 transition-all duration-300">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sua Mensagem Padrão</label>
              <textarea 
                className="border border-gray-200 bg-[#f8f9fa] p-2.5 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#00a884]"
                value={autoRespostaMensagem}
                onChange={e => handleAutoRespostaMensagemChange(e.target.value)}
                onBlur={handleBlurAutoResposta}
                rows={5}
                placeholder="Escreva a mensagem..."
              />
              <span className="text-[9px] text-gray-400 italic">Dica: O texto será salvo automaticamente quando você clicar fora da caixa.</span>
            </div>
          )}
        </div>

        {/* Feedback visual de salvo */}
        {salvoFeedback && (
          <div className="bg-[#e8f5f0] text-[#00a884] border border-[#d1ebd9] px-4 py-2.5 rounded-xl text-center text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm animate-pulse">
            <span>✨</span> Configurações salvas e fixadas!
          </div>
        )}

        {/* Botão de Salvar/Fechar */}
        <button 
          type="button" 
          onClick={onClose}
          className="bg-[#00a884] hover:bg-[#008f6f] text-white py-3 rounded-xl font-bold text-sm transition shadow-md flex items-center justify-center gap-2 mt-auto"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Concluir e Fechar
        </button>
      </form>
    </div>
  )
}
