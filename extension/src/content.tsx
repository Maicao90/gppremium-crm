import cssText from "data-text:~style.css"
import logoUrl from "data-base64:~assets/logo.jpg"
import type { PlasmoCSConfig } from "plasmo"
import React, { useEffect, useState } from "react"
import ReactDOM from "react-dom"
import { io } from "socket.io-client"
import ModalAgendamento from "./components/ModalAgendamento"
import Dashboard from "./components/Dashboard"
import Configuracoes from "./components/Configuracoes"
import MensagensRapidas from "./components/MensagensRapidas"


export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"]
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const socket = io("http://localhost:3000")

// Sistema centralizado de logs para envio silencioso e diagnóstico no backend
const logExtension = async (nivel: 'info' | 'warn' | 'error', escopo: string, mensagem: string, erro?: any) => {
  const logPrefix = `[CRM-${escopo.toUpperCase()}]`;
  if (nivel === 'error') {
    console.error(logPrefix, mensagem, erro || '');
  } else if (nivel === 'warn') {
    console.warn(logPrefix, mensagem);
  } else {
    console.log(logPrefix, mensagem);
  }
  
  try {
    await fetch("http://localhost:3000/api/extension-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nivel, escopo, mensagem, erro: erro ? { message: erro.message, stack: erro.stack } : undefined })
    });
  } catch (err) {
    // Falha silenciosa no envio do log para não causar loops
  }
}

// ═══ Helpers Geométricos do DOM: robustez total a mudanças de seletores do WhatsApp Web ═══
const obterBarraPesquisaGeometrica = (): HTMLDivElement | null => {
  const elements = Array.from(document.querySelectorAll('div[contenteditable="true"]')) as HTMLDivElement[];
  if (elements.length === 0) return null;

  const sorted = elements
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .filter(item => item.rect.width > 0 && item.rect.height > 0)
    .sort((a, b) => a.rect.left - b.rect.left);

  if (sorted.length === 0) return null;

  return sorted[0].el;
}

const obterCampoTextoGeometrico = (): HTMLDivElement | null => {
  const elements = Array.from(document.querySelectorAll('div[contenteditable="true"]')) as HTMLDivElement[];
  if (elements.length === 0) return null;

  const sorted = elements
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .filter(item => item.rect.width > 0 && item.rect.height > 0)
    .sort((a, b) => b.rect.left - a.rect.left);

  if (sorted.length === 0) return null;

  const larguraTela = window.innerWidth;
  const candidato = sorted[0];
  
  if (candidato.rect.left > larguraTela / 3) {
    return candidato.el;
  }

  const validos = sorted.filter(item => item.rect.left > larguraTela / 3);
  if (validos.length > 0) {
    return validos[0].el;
  }

  return null;
}

// ═══ Helper: insere texto no editor Lexical do WhatsApp via ClipboardEvent ═══
// Esta é a única forma 100% confiável — o Lexical processa eventos de paste nativamente
const inserirTextoNoLexical = async (el: HTMLElement, texto: string, acao: 'replace' | 'prepend' | 'append' = 'append'): Promise<void> => {
  el.focus()

  // Simula mousedown e mouseup para ativar o Lexical internamente
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
  
  const sel = window.getSelection()
  const range = document.createRange()

  try {
    if (acao === 'replace') {
      try {
        range.selectNodeContents(el)
        sel?.removeAllRanges()
        sel?.addRange(range)
        document.execCommand('delete', false)
      } catch (e) {
        el.textContent = ""
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
      }
    } else if (acao === 'prepend') {
      range.selectNodeContents(el)
      range.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(range)
    } else {
      range.selectNodeContents(el)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  } catch (err) {
    // Fallback de segurança se a seleção ou colapso falhar
    if (acao === 'replace') {
      el.textContent = ""
    }
  }
  
  document.dispatchEvent(new Event('selectionchange'))
  await new Promise(r => setTimeout(r, 30))

  if (texto) {
    // Tenta o método nativo de digitação insertText (mais robusto de todos no Lexical)
    try {
      document.execCommand('insertText', false, texto)
    } catch (err) {
      // Fallback paste Clipboard se falhar insertText
      try {
        const dt = new DataTransfer()
        dt.setData('text/plain', texto)
        const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
        el.dispatchEvent(ev)
      } catch (e) {
        logExtension('error', 'lexical', 'Erro no fallback paste', e)
      }
    }
  }

  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
}

const WhatsAppCRM = () => {
  const [showModal, setShowModal] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [showMensagensRapidas, setShowMensagensRapidas] = useState(false)
  const [filtroMensagens, setFiltroMensagens] = useState("")
  const showMensagensRapidasRef = React.useRef(showMensagensRapidas)

  useEffect(() => {
    showMensagensRapidasRef.current = showMensagensRapidas
  }, [showMensagensRapidas])

  const [contatosRecentes, setContatosRecentes] = useState<any[]>([])

  const [agendamentos, setAgendamentos] = useState<any[]>([])

  // Funções auxiliares para persistir os contatos coletados no localStorage
  const obterContatosCache = (): any[] => {
    try {
      const cached = localStorage.getItem("crm_contatos_acumulados")
      return cached ? JSON.parse(cached) : []
    } catch (e) {
      console.error("Erro ao obter cache de contatos:", e)
      return []
    }
  }

  const salvarContatosCache = (contatos: any[]) => {
    try {
      localStorage.setItem("crm_contatos_acumulados", JSON.stringify(contatos))
    } catch (e) {
      console.error("Erro ao salvar cache de contatos:", e)
    }
  }

  // Solicita ao script MAIN world (main-extractor.ts) que faça a extração dos contatos do IndexedDB
  // Isso evita problemas de bloqueio de CSP que ocorrem ao injetar scripts inline
  const solicitarExtracaoContatos = () => {
    try {
      window.postMessage({ type: "CRM_EXTRAIR_CONTATOS" }, "*")
      console.log("[CRM] Solicitação de extração de contatos enviada ao script MAIN world.")
    } catch (e) {
      console.error("[CRM] Erro ao solicitar extração de contatos:", e)
    }
  }

  // Envia a lista completa de contatos extraida para a API de sincronizacao em lote no backend
  const sincronizarContatosComServidor = async (contatos: any[]) => {
    if (!contatos || contatos.length === 0) return
    try {
      console.log(`[CRM] Sincronizando ${contatos.length} contatos com o backend...`)
      const res = await fetch("http://localhost:3000/api/contatos/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contatos })
      })
      if (res.ok) {
        const result = await res.json()
        console.log(`[CRM] Sincronização concluída com sucesso! ${result.count} contatos sincronizados no SQLite.`)
      } else {
        console.error("[CRM] Falha ao sincronizar contatos com o backend:", res.statusText)
      }
    } catch (error) {
      console.error("[CRM] Erro ao enviar requisição de sincronização:", error)
    }
  }

  // Busca todos os contatos salvos no SQLite do backend, atualizando cache e UI
  const carregarContatosDoServidor = async () => {
    try {
      const res = await fetch("http://localhost:3000/api/contatos")
      if (res.ok) {
        const contatos = await res.json()
        if (Array.isArray(contatos)) {
          salvarContatosCache(contatos)
          setContatosRecentes(contatos)
          console.log(`[CRM] ${contatos.length} contatos carregados da base do servidor.`);
        }
      }
    } catch (error) {
      console.error("[CRM] Erro ao carregar contatos do servidor:", error)
    }
  }

  const [usuarioLogado, setUsuarioLogado] = useState<any>(() => {
    try {
      const cached = localStorage.getItem("crm_usuario_logado")
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  })

  const carregarAgendamentosDoServidor = (usrId?: string) => {
    const idFiltro = usrId || (usuarioLogado ? usuarioLogado.id : null);
    if (!idFiltro) {
      setAgendamentos([]);
      return;
    }
    fetch(`http://localhost:3000/api/agendamentos?criadoPorId=${idFiltro}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAgendamentos(data)
          // Alimenta o cache de contatos com contatos vindos de agendamentos salvos
          const contatosCache = obterContatosCache()
          const contatosMap = new Map<string, string>()
          contatosCache.forEach((c: any) => {
            if (c.numero) contatosMap.set(c.numero.replace(/\D/g, ''), c.nome)
          })
          
          data.forEach((ag: any) => {
            if (ag.cliente && ag.numero) {
              const numLimpo = ag.numero.replace(/\D/g, '')
              if (!contatosMap.has(numLimpo)) {
                contatosMap.set(numLimpo, ag.cliente)
              }
            }
          })
          
          const novosContatos: any[] = []
          contatosMap.forEach((nome, numero) => novosContatos.push({ nome, numero }))
          salvarContatosCache(novosContatos)
        }
      })
      .catch(err => console.error("Erro ao carregar agendamentos:", err))
  }

  const [loginEmail, setLoginEmail] = useState("")
  const [loginSenha, setLoginSenha] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState("")

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError("")
    try {
      const res = await fetch("http://localhost:3000/api/usuarios/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, senha: loginSenha })
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem("crm_usuario_logado", JSON.stringify(data))
        if (data && data.nome) {
          localStorage.setItem("crm_nome_atendente", data.nome)
          localStorage.setItem("crm_usar_assinatura_manual", "true")
        }
        setUsuarioLogado(data)
        setLoginEmail("")
        setLoginSenha("")
        // Registra o atendente logado no Socket.io e carrega seus agendamentos imediatamente
        socket.emit("registrar_atendente", data.id)
        carregarAgendamentosDoServidor(data.id)
      } else {
        setLoginError(data.error || "E-mail ou senha incorretos.")
      }
    } catch (err) {
      console.error(err)
      setLoginError("Erro de comunicação com o servidor.")
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    if (confirm(`Deseja realmente sair da conta de ${usuarioLogado?.nome}?`)) {
      localStorage.removeItem("crm_usuario_logado")
      localStorage.removeItem("crm_nome_atendente")
      setUsuarioLogado(null)
      setAgendamentos([])
    }
  }

  useEffect(() => {
    if (usuarioLogado && usuarioLogado.nome) {
      localStorage.setItem("crm_nome_atendente", usuarioLogado.nome)
      localStorage.setItem("crm_usar_assinatura_manual", "true")
      socket.emit("registrar_atendente", usuarioLogado.id)
      carregarAgendamentosDoServidor(usuarioLogado.id)
    } else {
      setAgendamentos([])
    }
  }, [usuarioLogado])

  const usuarioId = usuarioLogado ? usuarioLogado.id : "user-123"

  useEffect(() => {
    // Carrega contatos do servidor (SQLite) IMEDIATAMENTE ao abrir a página
    carregarContatosDoServidor()
    
    socket.on("connect", () => {
      console.log("Conectado ao CRM Backend")
      if (usuarioLogado && usuarioLogado.id) {
        socket.emit("registrar_atendente", usuarioLogado.id)
      }
    })
    
    socket.on("DISPARAR_MENSAGEM", async (agendamento) => {
      console.log("Hora de enviar a mensagem!", agendamento)
      try {
        const finalStatus = await enviarMensagemWhatsApp(agendamento.numero, agendamento.mensagem, agendamento)
        console.log(`[RPA] Atualizando status no backend para: ${finalStatus}`)
        
        await fetch(`http://localhost:3000/api/agendamentos/${agendamento.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: finalStatus })
        })
      } catch (error) {
        console.error("[RPA] Erro no fluxo de disparo de mensagem:", error)
      }
    })

    socket.on("AGENDAMENTO_CRIADO", (agendamento) => {
      if (usuarioLogado && agendamento.criadoPorId === usuarioLogado.id) {
        setAgendamentos((prev) => [...prev, agendamento])
      }
    })

    socket.on("STATUS_ATUALIZADO", (atualizado) => {
      if (usuarioLogado && atualizado.criadoPorId === usuarioLogado.id) {
        setAgendamentos((prev) => 
          prev.map(a => a.id === atualizado.id ? atualizado : a)
        )
      }
    })

    socket.on("AGENDAMENTO_EXCLUIDO", ({ id }) => {
      setAgendamentos((prev) => prev.filter(a => a.id !== id))
    })

    socket.on("AGENDAMENTO_ATUALIZADO", (atualizado) => {
      if (usuarioLogado && atualizado.criadoPorId === usuarioLogado.id) {
        setAgendamentos((prev) => 
          prev.map(a => a.id === atualizado.id ? atualizado : a)
        )
      }
    })

    // Escuta a resposta do extrator injetado na pagina principal (MAIN world)
    const handleMainMessage = async (event: MessageEvent) => {
      if (event.source !== window) return
      
      if (event.data?.type === "CRM_LOG") {
        const { nivel, escopo, mensagem, erro } = event.data
        logExtension(nivel, escopo, mensagem, erro)
        return
      }

      if (event.data && event.data.type === "CRM_CONTATOS_EXTRAIDOS") {
        const contatos = event.data.contatos
        if (Array.isArray(contatos) && contatos.length > 0) {
          console.log(`[CRM] Recebidos ${contatos.length} contatos injetados do MAIN world. Sincronizando em background...`)
          // Dispara a sincronização em background, sem bloquear a UI com await
          sincronizarContatosComServidor(contatos).then(() => {
             // Atualiza a lista apenas quando a sincronização terminar silenciosamente
             carregarContatosDoServidor()
          })
        }
      }

      if (event.data?.type === "CRM_LIVE_SEARCH") {
        const query = event.data.query
        const SEARCH_SELECTORS = [
          'div[contenteditable="true"][title="Pesquisar ou começar uma nova conversa"]',
          'div[contenteditable="true"][title="Search or start new chat"]',
          '#side div[contenteditable="true"]'
        ]
        let searchInput: HTMLDivElement | null = null
        for (const sel of SEARCH_SELECTORS) {
          const el = document.querySelector(sel) as HTMLDivElement
          if (el) { searchInput = el; break }
        }

        if (searchInput) {
          // Salva foco atual do modal para restaurar imediatamente
          const activeEl = document.activeElement as HTMLElement
          
          await inserirTextoNoLexical(searchInput, query, 'replace')
          
          // Devolve foco ao modal instantaneamente para não quebrar a digitação
          if (activeEl) {
            setTimeout(() => activeEl.focus(), 10)
          }

          // Aguarda o WhatsApp Web processar e mostrar resultados
          setTimeout(() => {
            const results: any[] = []
            
            const chatRowSelectors = [
              '#pane-side div[role="row"]',
              '#pane-side div[role="listitem"]',
              '#pane-side li',
            ]

            let chatRows: NodeListOf<Element> | null = null
            for (const sel of chatRowSelectors) {
              const rows = document.querySelectorAll(sel)
              if (rows.length > 0) { chatRows = rows; break }
            }
            
            if (chatRows) {
              for (const row of Array.from(chatRows)) {
                let nome = ''
                let numero = ''
                let foto = ''

                // Imagem
                const imgEl = row.querySelector('img')
                if (imgEl) {
                  foto = imgEl.getAttribute('src') || ''
                }

                // Tenta extrair via React Fiber (Método Supremo)
                const fiberData = getContactFromFiber(row)
                if (fiberData) {
                  nome = fiberData.nome
                  numero = fiberData.numero
                }

                // Fallback DOM para nome
                if (!nome || !numero || nome === numero || /^[0-9]+$/.test(nome.replace(/\D/g, ''))) {
                  let possivelNome = ''
                  const titleEl = row.querySelector('span[title]')
                  if (titleEl) {
                    possivelNome = titleEl.getAttribute('title') || titleEl.textContent || ''
                  }
                  if (!possivelNome || possivelNome === numero || /^[0-9]+$/.test(possivelNome.replace(/\D/g, ''))) {
                    const dirEl = row.querySelector('span[dir="auto"]')
                    if (dirEl) possivelNome = dirEl.textContent || ''
                  }
                  possivelNome = possivelNome.trim()
                  if (possivelNome) {
                    nome = possivelNome
                  }
                }

                // Número JID do data-id
                if (!numero) {
                  const rowDataId = (row as HTMLElement).getAttribute('data-id') ||
                                    row.querySelector('[data-id]')?.getAttribute('data-id') || ''
                  if (rowDataId && rowDataId.includes('@c.us')) {
                    numero = rowDataId.split('@')[0]
                  }
                }

                // Número JID de atributos genéricos
                if (!numero) {
                  const allEls = row.querySelectorAll('*')
                  for (const el of Array.from(allEls)) {
                    for (const attr of Array.from(el.attributes)) {
                      if (attr.value.includes('@c.us') && !attr.value.includes('@g.us')) {
                        const extracted = attr.value.split('@')[0].replace(/\D/g, '')
                        if (extracted && extracted.length >= 8) {
                          numero = extracted
                          break
                        }
                      }
                    }
                    if (numero) break
                  }
                }

                // Número JID da foto
                if (!numero && imgEl) {
                  const src = imgEl.getAttribute('src') || ''
                  const match = src.match(/[?&]u=([^&%]+)/)
                  if (match) numero = match[1].split('@')[0]
                }

                // Número se o nome for apenas número
                if (!numero && nome && /^\+?[\d\s\-()]+$/.test(nome)) {
                  numero = nome.replace(/\D/g, '')
                }

                if (nome && nome !== 'Pesquisar...' && !nome.includes('Pesquisando')) {
                  const numLimpo = numero.replace(/\D/g, '')
                  results.push({ 
                    nome: nome.trim(), 
                    numero: numLimpo || '', 
                    foto 
                  })
                }
              }
            }
            
            window.postMessage({ type: "CRM_LIVE_SEARCH_RESULTS", results }, "*")
          }, 800)
        }
      }
    }
    window.addEventListener("message", handleMainMessage)

    // Dispara a primeira varredura solicitando ao script MAIN world e carrega contatos do servidor
    // Aguarda 10 segundos para garantir que o WhatsApp Web e o IndexedDB estejam totalmente inicializados
    setTimeout(() => {
      solicitarExtracaoContatos()
    }, 10000)
    carregarContatosDoServidor()

    fetch('http://localhost:3000/api/agendamentos')
      .then(res => res.json())
      .then(data => {
        setAgendamentos(data)
        // Alimenta o cache de contatos com contatos vindos de agendamentos salvos
        if (Array.isArray(data)) {
          const contatosCache = obterContatosCache()
          const contatosMap = new Map<string, string>()
          contatosCache.forEach((c: any) => {
            if (c.numero) contatosMap.set(c.numero.replace(/\D/g, ''), c.nome)
          })
          
          data.forEach((ag: any) => {
            if (ag.cliente && ag.numero) {
              const numLimpo = ag.numero.replace(/\D/g, '')
              if (!contatosMap.has(numLimpo)) {
                contatosMap.set(numLimpo, ag.cliente)
              }
            }
          })
          
          const novosContatos: any[] = []
          contatosMap.forEach((nome, numero) => novosContatos.push({ nome, numero }))
          salvarContatosCache(novosContatos)
        }
      })

    // Solicita re-extração de contatos do IndexedDB via MAIN world a cada 30 minutos (1800000ms) como backup
    const intervalSincronizar = setInterval(() => {
      solicitarExtracaoContatos()
    }, 1800000)

    // Varredura de contatos periódica visual (pane-side) a cada 8 segundos
    const intervalContatos = setInterval(() => {
      const visiveis = obterContatosRecentes()
      // Sincroniza qualquer novo contato capturado visualmente imediatamente
      if (visiveis.length > 0) {
        sincronizarContatosComServidor(visiveis)
      }
    }, 8000)

    return () => {
      socket.off("connect")
      socket.off("DISPARAR_MENSAGEM")
      socket.off("AGENDAMENTO_CRIADO")
      socket.off("STATUS_ATUALIZADO")
      socket.off("AGENDAMENTO_EXCLUIDO")
      socket.off("AGENDAMENTO_ATUALIZADO")
      window.removeEventListener("message", handleMainMessage)
      clearInterval(intervalSincronizar)
      clearInterval(intervalContatos)
    }
  }, [])

  // useEffect reativo para injeção dinâmica de layout (sem sobreposição física)
  useEffect(() => {
    const styleId = "crm-layout-empurrar-whatsapp"
    let styleEl = document.getElementById(styleId) as HTMLStyleElement

    if (!styleEl) {
      styleEl = document.createElement("style")
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    const painelAberto = showDashboard || showMensagensRapidas || showConfig
    const recuoTotal = painelAberto ? 440 : 60

    styleEl.textContent = `
      #app {
        width: calc(100% - ${recuoTotal}px) !important;
        right: ${recuoTotal}px !important;
        left: 0px !important;
        position: absolute !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
    `

    return () => {
      const el = document.getElementById(styleId)
      if (el) el.remove()
    }
  }, [showDashboard, showMensagensRapidas, showConfig])

  // Efeito para interceptar as mensagens manuais do vendedor e adicionar a assinatura
  useEffect(() => {    // ═══ Helper: localiza o campo de texto da conversa ativa ═══
    const obterCampoTexto = (): HTMLElement | null => {
      const geomEl = obterCampoTextoGeometrico()
      if (geomEl) return geomEl

      const SELS = [
        'div[contenteditable="true"][data-tab="10"]',
        'div[contenteditable="true"][data-tab="6"]',
        'footer div[contenteditable="true"]',
        '[data-testid="conversation-compose-box-input"]',
        '#main div[contenteditable="true"]',
      ]
      for (const s of SELS) {
        const el = document.querySelector(s) as HTMLElement
        if (el) return el
      }
      return null
    }

    // ═══ Helper: clica no botão de enviar ═══
    const clicarEnviar = (): void => {
      const SELS = [
        'button[data-testid="compose-btn-send"]',
        'footer button[aria-label="Enviar"]',
        'footer button[aria-label="Send"]',
        '[data-testid="send"]',
        'footer span[data-icon="send"]',
      ]
      for (const s of SELS) {
        const el = document.querySelector(s)
        if (!el) continue
        const btn = (el.closest('button') || el) as HTMLElement
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        setTimeout(() => { try { btn.click() } catch (_) {} }, 100)
        break
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Interceptação de atalhos rápidos (/) ao pressionar Espaço ou Enter
      const rawTarget = e.target as HTMLElement
      const targetEl = rawTarget ? rawTarget.closest('[contenteditable="true"]') as HTMLElement : null
      if (targetEl && targetEl.closest('footer')) {
        if (e.key === ' ' || e.key === 'Enter') {
          const textoAtual = targetEl.innerText || targetEl.textContent || ""
          const textoLimpo = textoAtual.trim()
          
          if (textoLimpo.includes("/")) {
            // Pega a última palavra digitada
            const palavras = textoAtual.split(/[\s\n]+/)
            const ultimaPalavra = palavras[palavras.length - 1]
            
            if (ultimaPalavra.startsWith("/")) {
              // Carrega templates
              const obterTemplatesRapidos = (): any[] => {
                try {
                  const saved = localStorage.getItem("crm_mensagens_rapidas")
                  if (saved) return JSON.parse(saved)
                } catch (e) {
                  console.error(e)
                }
                return [
                  { id: "default-1", titulo: "/boasvindas", texto: "Olá! Seja muito bem-vindo à GP Pneus. 🛞 Meu nome é {atendente}. Como posso te ajudar hoje?" },
                  { id: "default-2", titulo: "/orcamento", texto: "Claro! Para que eu possa gerar o melhor orçamento para você, poderia me informar a medida do pneu que você precisa (ex: 205/55 R16) e a marca de sua preferência? 😊" },
                  { id: "default-3", titulo: "/catalogo", texto: "Seguem os modelos de pneus de alta performance que temos disponíveis hoje na GP Pneus. Todos com garantia oficial e entrega expressa! 🚀" }
                ]
              }
              
              const templates = obterTemplatesRapidos()
              const templateEncontrado = templates.find(t => t.titulo.toLowerCase() === ultimaPalavra.toLowerCase())
              
              if (templateEncontrado) {
                // Impede o envio ou o espaço de ser inserido
                e.preventDefault()
                e.stopPropagation()
                
                const nomeAtendente = localStorage.getItem("crm_nome_atendente") || "Atendente"
                const textoFinal = templateEncontrado.texto.replace(/{atendente}/g, nomeAtendente)
                
                // Acha o parágrafo ou o nó editável do Lexical
                const targetNode = targetEl.querySelector('p') || targetEl
                
                // Encontra onde o atalho estava e substitui
                const idxUltimaPalavra = textoAtual.lastIndexOf(ultimaPalavra)
                const textoAnterior = textoAtual.substring(0, idxUltimaPalavra)
                
                // Adiciona o texto do template + o caractere digitado (se for espaço)
                const textoAInjetar = textoAnterior + textoFinal + (e.key === ' ' ? ' ' : '')
                
                // Usa a nova lógica robusta assíncrona do Lexical para substituir tudo
                inserirTextoNoLexical(targetNode, textoAInjetar, 'replace').then(() => {
                  targetEl.dispatchEvent(new Event('input', { bubbles: true }))
                  targetNode.dispatchEvent(new Event('input', { bubbles: true }))
                })
                
                // Oculta painel lateral
                setShowMensagensRapidas(false)
                setFiltroMensagens("")
                
                return
              }
            }
          }
        }
      }

      // 2. Assinatura automática no Enter
      if (e.key === 'Enter' && !e.shiftKey) {
        const rawTarget = e.target as HTMLElement
        // É uma área editável que NÃO está no painel lateral esquerdo (#side = pesquisa)?
        const target = rawTarget?.closest('[contenteditable="true"]') as HTMLElement | null
        const isComposeBox = target &&
          !target.closest('#side') &&
          !target.closest('[data-testid="chat-list-search"]')

        if (isComposeBox) {
          const usarAssinaturaManual = localStorage.getItem("crm_usar_assinatura_manual") === "true"
          const nomeAtendente = localStorage.getItem("crm_nome_atendente") || ""

          if (usarAssinaturaManual && nomeAtendente) {
            // Usamos textContent puro para checar a assinatura (ignora quebras de linha problemáticas do innerText)
            const textoAtualRaw = target.textContent || ""
            const prefixo = `*${nomeAtendente}:*\n`

            if (textoAtualRaw.trim() && !textoAtualRaw.startsWith(`*${nomeAtendente}:*`)) {
              e.preventDefault()
              e.stopPropagation()

              // Injeta a assinatura perfeitamente no INÍCIO (prepend), sem destruir e recriar o texto atual!
              inserirTextoNoLexical(target, prefixo, 'prepend').then(() => {
                setTimeout(() => clicarEnviar(), 50)
              })
            }
          }
        }
      }
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      
      const btnNode = target.closest('button') || target.closest('[role="button"]') || target
      const isSendBtn =
        !!btnNode.closest('[data-testid="compose-btn-send"]') ||
        !!btnNode.closest('[data-testid="send"]') ||
        !!btnNode.querySelector('span[data-icon="send"]') ||
        !!(target.tagName.toLowerCase() === 'span' && target.getAttribute('data-icon') === 'send') ||
        !!target.closest('span[data-icon="send"]')

      if (isSendBtn) {
        const usarAssinaturaManual = localStorage.getItem("crm_usar_assinatura_manual") === "true"
        const nomeAtendente = localStorage.getItem("crm_nome_atendente") || ""
        const inputEl = obterCampoTexto()

        if (usarAssinaturaManual && nomeAtendente && inputEl) {
          const textoAtualRaw = (inputEl.textContent || "").replace(/[\u200b\u200c\u200d\ufeff\u00a0]/g, "")
          const prefixo = `*${nomeAtendente}:*\n`

          if (textoAtualRaw.trim() && !textoAtualRaw.startsWith(`*${nomeAtendente}:*`)) {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()

            inserirTextoNoLexical(inputEl, prefixo, 'prepend').then(() => {
              setTimeout(() => clicarEnviar(), 50)
            })
          }
        }
      }
    }

    const handleInput = (e: Event) => {
      const rawTarget = e.target as HTMLElement
      const target = rawTarget ? rawTarget.closest('[contenteditable="true"]') as HTMLElement : null
      if (target && target.closest('footer')) {
        // Tenta obter o texto juntando os spans do Lexical para máxima precisão e sem atraso do DOM
        const spans = target.querySelectorAll('[data-lexical-text="true"]')
        let texto = ""
        if (spans.length > 0) {
          texto = Array.from(spans).map(s => s.textContent || "").join("")
        } else {
          texto = target.innerText || target.textContent || ""
        }
        
        // Remove quaisquer caracteres de controle ou formatação invisíveis do Unicode e do Lexical (como Zero Width Space \u200b)
        const textoLimpo = texto.replace(/[\u200b\u200c\u200d\ufeff\u00a0]/g, "").trim()
        
        if (textoLimpo.startsWith("/")) {
          setShowDashboard(false)
          setShowConfig(false)
          setShowMensagensRapidas(true)
          setFiltroMensagens(textoLimpo)
        } else if (showMensagensRapidasRef.current && !textoLimpo.includes("/")) {
          setShowMensagensRapidas(false)
          setFiltroMensagens("")
        }
      }
    }

    // Registra os listeners no document com useCapture = true para interceptar antes do WhatsApp
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('mousedown', handleClick, true)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('input', handleInput, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('mousedown', handleClick, true)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('input', handleInput, true)
    }
  }, [])

  const getContactFromFiber = (el: Element | null): { nome: string, numero: string } | null => {
    if (!el) return null
    
    const findJidInObject = (obj: any, depth = 0): string | null => {
      if (depth > 4 || !obj) return null
      if (typeof obj === 'string') {
        if (/^[0-9]{10,15}@c\.us$/.test(obj)) return obj.split('@')[0]
        return null
      }
      if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          if (['children', 'parent', '_owner', 'return', 'sibling', 'alternate', 'memoizedState'].includes(key)) continue
          const res = findJidInObject(obj[key], depth + 1)
          if (res) return res
        }
      }
      return null
    }

    try {
      let currentEl: Element | null = el
      let depth = 0
      
      while (currentEl && depth < 4) {
        const key = Object.keys(currentEl).find(k => k.startsWith('__reactFiber$'))
        
        if (key) {
          let fiber: any = (currentEl as any)[key]
          let fiberDepth = 0
          while (fiber && fiberDepth < 10) {
            const props = fiber.memoizedProps || fiber.pendingProps
            if (props) {
              const possibleContacts = [
                props.chat,
                props.contact,
                props.data?.contact,
                props.data?.chat?.contact,
                props.data,
                props.chat?.contact
              ]
              
              for (const c of possibleContacts) {
                if (c && c.id) {
                  let num = ''
                  if (typeof c.id === 'string' && c.id.includes('@c.us')) {
                    num = c.id.split('@')[0]
                  } else if (typeof c.id === 'object' && c.id.user && c.id.server === 'c.us') {
                    num = c.id.user
                  }
                  
                  if (num && num.length >= 8) {
                    const name = c.name || c.pushname || c.formattedName || num
                    return { nome: name, numero: num }
                  }
                }
              }
              
              // Fallback extremo: busca recursiva profunda pelo JID nos props
              const deepNum = findJidInObject(props)
              if (deepNum) {
                return { nome: props.name || props.title || deepNum, numero: deepNum }
              }
            }
            fiber = fiber.return
            fiberDepth++
          }
        }
        currentEl = currentEl.parentElement
        depth++
      }
    } catch (e) {
      console.error("[GPPREMIUM] Falha ao ler Fiber:", e)
    }
    return null
  }

  const getActiveChatInfo = () => {
    const header = document.querySelector('header')
    if (!header) return { nome: 'Nenhum contato selecionado', numero: '' }

    let nome = ''
    let numero = ''

    // 1. Tenta extrair dados precisos via React Fiber do cabeçalho
    const fiberData = getContactFromFiber(header)
    if (fiberData) {
      nome = fiberData.nome
      numero = fiberData.numero
    }

    // Se o Fiber não pegou o nome ou pegou apenas o número, tentamos o DOM
    if (!nome || nome === numero || /^[0-9]+$/.test(nome.replace(/\D/g, ''))) {
      let possivelNome = ''
      // 2. Procura spans no header que tenham atributo title (seletor clássico)
      const spansWithTitle = Array.from(header.querySelectorAll('span[title]'))
      for (const span of spansWithTitle) {
        const title = span.getAttribute('title')
        if (title && title !== 'Pesquisar...' && title.length > 1 && !title.includes('online') && !title.includes('digitando') && !title.includes('visto por último')) {
          possivelNome = title
          break
        }
      }

      // 3. Se não achou, tenta pegar o primeiro span com dir="auto" no cabeçalho
      if (!possivelNome) {
        const spansDirAuto = Array.from(header.querySelectorAll('span[dir="auto"]'))
        for (const span of spansDirAuto) {
          const text = span.textContent?.trim()
          if (text && text.length > 1 && !text.includes('online') && !text.includes('digitando') && !text.includes('visto por último') && text !== 'Pesquisar...') {
            possivelNome = text
            break
          }
        }
      }

      // Aceita o nome do DOM mesmo se for numérico (contato não salvo)
      if (possivelNome) {
        nome = possivelNome
      }
    }

    // 2. Procura spans no header que tenham atributo title (seletor clássico)
    const spansWithTitle = Array.from(header.querySelectorAll('span[title]'))
    for (const span of spansWithTitle) {
      const title = span.getAttribute('title')
      if (title && title !== 'Pesquisar...' && title.length > 1 && !title.includes('online') && !title.includes('digitando') && !title.includes('visto por último')) {
        nome = title
        break
      }
    }

    // 2. Se não achou, tenta pegar o primeiro span com dir="auto" no cabeçalho que tenha texto válido
    if (!nome) {
      const spansDirAuto = Array.from(header.querySelectorAll('span[dir="auto"]'))
      for (const span of spansDirAuto) {
        const text = span.textContent?.trim()
        if (text && text.length > 1 && !text.includes('online') && !text.includes('digitando') && !text.includes('visto por último') && text !== 'Pesquisar...') {
          nome = text
          break
        }
      }
    }

    // 3. Se ainda assim não achou, faz uma varredura geral nas divs e spans do cabeçalho que parecem conter o nome
    if (!nome) {
      const textContainers = Array.from(header.querySelectorAll('div[role="button"] span'))
      for (const el of textContainers) {
        const text = el.textContent?.trim()
        if (text && text.length > 1 && !text.includes('online') && !text.includes('digitando') && !text.includes('visto por último')) {
          nome = text
          break
        }
      }
    }

    // Fallback amigável
    if (!nome) {
      nome = 'Conversa Sem Nome'
    }

    nome = nome.trim()

    // 1. Tenta obter o número JID da foto de perfil no cabeçalho
    const img = header.querySelector('img')
    if (img) {
      const src = img.getAttribute('src') || ''
      const match = src.match(/[?&]u=([^&%]+)/)
      if (match) {
        numero = match[1].split('@')[0]
      }
    }

    // 2. Se o próprio nome for um número de telefone formatado (ex: +55 11 99999-9999), extrai os números
    if (!numero && /^\+?[0-9\s\-()]+$/.test(nome)) {
      const cleaned = nome.replace(/\D/g, '')
      if (cleaned.length >= 8 && cleaned.length <= 15) {
        numero = cleaned
      }
    }

    // 3. Cruzamento inteligente de dados: se o número não está na foto de perfil (pode ser URL blob),
    // procuramos na nossa varredura de contatos recentes pelo mesmo nome de exibição!
    if (!numero && nome !== 'Conversa Sem Nome') {
      // Como obterContatosRecentes() usa getActiveChatInfo, chamamos a lógica de varredura manual de pane-side diretamente
      const chatRows = document.querySelectorAll('#pane-side div[role="row"]')
      for (const row of Array.from(chatRows)) {
        // Acha o nome na linha
        let rowNome = ''
        const titleEl = row.querySelector('span[title]')
        if (titleEl) {
          rowNome = titleEl.getAttribute('title') || titleEl.textContent || ''
        } else {
          const dirEl = row.querySelector('span[dir="auto"]')
          if (dirEl) rowNome = dirEl.textContent || ''
        }

        rowNome = rowNome.trim()

        if (rowNome === nome) {
          // Extrai o número
          const rowImg = row.querySelector('img')
          if (rowImg) {
            const src = rowImg.getAttribute('src') || ''
            const match = src.match(/[?&]u=([^&%]+)/)
            if (match) {
              numero = match[1].split('@')[0]
              break
            }
          }
        }
      }
    }

    return { nome, numero }
  }

  // Helper de normalização do número no robô (garante código do país 55 para o Brasil)
  const normalizarNumeroRPA = (num: string): string => {
    let limpo = num.replace(/\D/g, '')
    if (limpo && (limpo.length === 10 || limpo.length === 11) && !limpo.startsWith('55')) {
      limpo = '55' + limpo
    }
    return limpo || num
  }

  // Helper para detectar e fechar automaticamente diálogos de erro no WhatsApp Web (como número inválido)
  const fecharPopupErroWhatsAppWeb = async (): Promise<boolean> => {
    const dialog = document.querySelector('div[role="dialog"]')
    if (dialog) {
      console.log("[RPA] Detectado diálogo/pop-up de erro ou aviso no WhatsApp Web. Analisando...")
      const botoes = Array.from(dialog.querySelectorAll('button, div[role="button"]'))
      for (const btn of botoes) {
        const txt = btn.textContent?.trim().toUpperCase()
        if (txt === 'OK' || txt === 'FECHAR' || txt === 'CLOSE' || txt === 'CONFIRMAR') {
          (btn as HTMLElement).click()
          console.log("[RPA] Pop-up de erro fechado com sucesso.")
          await new Promise(r => setTimeout(r, 500))
          return true
        }
      }
    }
    return false
  }

  // Função do Robô para abrir uma conversa pesquisando pelo número ou nome com tolerância a falhas e nono dígito
  const abrirConversa = async (numero: string, nomeFallback?: string) => {
    const numBusca = normalizarNumeroRPA(numero)
    
    // Identifica se é um nome real e válido na agenda
    const temNomeValido = nomeFallback && 
                          nomeFallback !== 'Conversa Sem Nome' && 
                          nomeFallback !== 'Manual' && 
                          nomeFallback.trim().length > 0 &&
                          !/^\+?[0-9\s\-()]+$/.test(nomeFallback)

    logExtension('info', 'rpa-visual', `Abrindo conversa para: ${numBusca || nomeFallback} (Nome Válido: ${temNomeValido ? 'Sim' : 'Não'})`)

    // ── Passo 1: Encontrar a barra de pesquisa com Polling Resiliente e Geometria DOM ──
    const SEARCH_SELECTORS = [
      'div[contenteditable="true"][data-tab="3"]',
      'div[contenteditable="true"][title="Pesquisar ou começar uma nova conversa"]',
      'div[contenteditable="true"][title="Search or start new chat"]',
      'div[contenteditable="true"][title*="Pesquisar"]',
      'div[contenteditable="true"][title*="Search"]',
      '#side div[contenteditable="true"]',
      '#side [contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[role="textbox"][data-tab="3"]',
      '[data-testid="chat-list-search"]',
      'span[data-icon="search"] ~ div[contenteditable="true"]',
      'div.lexical-rich-text-input [contenteditable="true"]',
    ]

    let searchInput: HTMLDivElement | null = null
    logExtension('info', 'rpa-visual', 'Procurando pela barra de pesquisa do WhatsApp (com polling resiliente e geometria DOM)...')
    for (let i = 0; i < 10; i++) {
      const geomEl = obterBarraPesquisaGeometrica()
      if (geomEl) {
        searchInput = geomEl
        logExtension('info', 'rpa-visual', 'Barra de pesquisa localizada geometricamente com sucesso.')
        break
      }

      for (const sel of SEARCH_SELECTORS) {
        const el = document.querySelector(sel) as HTMLDivElement
        if (el) { searchInput = el; break }
      }
      if (searchInput) break
      await new Promise(r => setTimeout(r, 300))
    }

    if (!searchInput) {
      logExtension('error', 'rpa-visual', 'Barra de pesquisa não encontrada no DOM após polling de geometria e seletores. Abortando.')
      return false
    }

    const RESULT_SELECTORS = [
      '#pane-side div[role="listitem"]',
      '#pane-side div[role="row"]',
      '#pane-side div[role="button"]',
      '#pane-side button',
      '#pane-side li[role="listitem"]',
      'div[data-testid="list-item-chat"]',
      '#pane-side div[tabindex="-1"]',
      '[aria-label="Lista de conversas"] div[role="row"]',
      '[aria-label="Chat list"] div[role="row"]',
    ]

    const tentarClicarNoPrimeiroResultado = async (): Promise<boolean> => {
      // Pequeno delay para renderizar elementos no DOM
      await new Promise(r => setTimeout(r, 600))
      
      // Fecha pop-up de erro se houver antes de clicar
      await fecharPopupErroWhatsAppWeb()

      let firstContact: HTMLElement | null = null
      for (const sel of RESULT_SELECTORS) {
        const els = document.querySelectorAll(sel)
        // Filtra elementos para garantir que não estamos clicando em avisos textuais de busca vazia
        const validos = Array.from(els).filter((el: any) => {
          const txt = el.textContent || ""
          return txt.trim().length > 0 && !txt.includes("Não foram encontrados") && !txt.includes("Pesquisando")
        })

        if (validos.length > 0) {
          firstContact = validos[0] as HTMLElement
          logExtension('info', 'rpa-visual', `Primeiro resultado encontrado com seletor: ${sel}`)
          break
        }
      }

      if (firstContact) {
        const clickableEl = firstContact.querySelector('span[title], img, div[role="button"], div[tabindex]') || firstContact
        logExtension('info', 'rpa-visual', `Efetuando clique no elemento clicável interno: ${clickableEl?.tagName || 'desconhecido'}`)
        
        clickableEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
        clickableEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
        clickableEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        if (typeof (clickableEl as any).click === 'function') {
          try { (clickableEl as HTMLElement).click() } catch (_) {}
        }
        
        logExtension('info', 'rpa-visual', 'Clique no resultado executado. Aguardando chat abrir...')
        await new Promise(r => setTimeout(r, 1500))
        
        // Verifica se abriu pop-up de erro após clicar (ex: número inválido)
        const erroPopup = await fecharPopupErroWhatsAppWeb()
        if (erroPopup) {
          logExtension('warn', 'rpa-visual', 'Detectado pop-up de erro após o clique. Cancelando fluxo para este JID.')
          return false
        }
        
        return true
      }
      return false
    }

    const savedDelayAbrir = localStorage.getItem("crm_delay_abrir_chat")
    const delayAbrir = savedDelayAbrir ? parseFloat(savedDelayAbrir) * 1000 : 2000

    try {
      // ── Estratégia de Busca 1: Pesquisa por Nome (se o contato estiver salvo na agenda) ──
      if (temNomeValido) {
        logExtension('info', 'rpa-visual', `Estratégia 1: Pesquisando na lupa pelo nome do contato: ${nomeFallback}`)
        await inserirTextoNoLexical(searchInput, nomeFallback, 'replace')
        await new Promise(r => setTimeout(r, delayAbrir))

        const sucesso = await tentarClicarNoPrimeiroResultado()
        if (sucesso) return true
        logExtension('warn', 'rpa-visual', 'Busca pelo nome não abriu o chat com sucesso. Tentando busca por número...')
      }

      // ── Estratégia de Busca 2: Pesquisa por Número (como informado originalmente) ──
      logExtension('info', 'rpa-visual', `Estratégia 2: Pesquisando na lupa pelo número original: ${numBusca}`)
      await inserirTextoNoLexical(searchInput, numBusca, 'replace')
      await new Promise(r => setTimeout(r, delayAbrir))

      let sucesso = await tentarClicarNoPrimeiroResultado()
      if (sucesso) return true

      // ── Estratégia de Busca 3: Fallback de Nono Dígito Brasileiro ──
      if (numBusca.startsWith('55')) {
        const semDDI = numBusca.substring(2) // Ex: 61991884391 ou 6191884391
        
        if (semDDI.length === 11) {
          // Tem o nono dígito (ex: 61991884391). Tentamos remover o nono dígito (o primeiro 9 após o DDD de 2 dígitos)
          const ddd = semDDI.substring(0, 2)
          const resto = semDDI.substring(3)
          const numAlternativo = '55' + ddd + resto // Ex: 556191884391
          
          logExtension('info', 'rpa-visual', `Estratégia 3 (Nono Dígito): Tentando busca com remoção do 9: ${numAlternativo}`)
          await inserirTextoNoLexical(searchInput, numAlternativo, 'replace')
          await new Promise(r => setTimeout(r, delayAbrir))
          
          sucesso = await tentarClicarNoPrimeiroResultado()
          if (sucesso) return true
        } 
        else if (semDDI.length === 10) {
          // Não tem o nono dígito (ex: 6191884391). Tentamos adicionar o 9 após o DDD
          const ddd = semDDI.substring(0, 2)
          const resto = semDDI.substring(2)
          const numAlternativo = '55' + ddd + '9' + resto // Ex: 5561991884391
          
          logExtension('info', 'rpa-visual', `Estratégia 3 (Nono Dígito): Tentando busca adicionando o 9: ${numAlternativo}`)
          await inserirTextoNoLexical(searchInput, numAlternativo, 'replace')
          await new Promise(r => setTimeout(r, delayAbrir))
          
          sucesso = await tentarClicarNoPrimeiroResultado()
          if (sucesso) return true
        }
      }

      logExtension('error', 'rpa-visual', 'Não foi possível localizar ou abrir o contato através de nenhuma estratégia de busca.')
      return false
    } finally {
      // Limpa a barra de pesquisa ao final (seja por sucesso ou erro)
      try {
        logExtension('info', 'rpa-visual', 'Limpando a barra de pesquisa do WhatsApp...')
        await inserirTextoNoLexical(searchInput, "", 'replace')
      } catch (err: any) {
        logExtension('warn', 'rpa-visual', `Não foi possível limpar a barra de pesquisa: ${err?.message || err}`)
      }
    }
  }

  // Função do Robô para digitar o texto e clicar em enviar com emulação física robusta
  const digitarESend = async (mensagem: string) => {
    // ── Passo 1: Encontrar o campo de texto com Geometria DOM e Fallbacks ──
    const INPUT_SELECTORS = [
      'footer div[contenteditable="true"]',
      'footer div[role="textbox"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][data-tab="6"]',
      'div[data-testid="conversation-compose-box-input"]',
      'footer [contenteditable="true"]',
      'div[title="Digite uma mensagem"]',
      'div[title="Type a message"]',
    ]

    let inputEl: HTMLDivElement | null = null
    
    const geomEl = obterCampoTextoGeometrico()
    if (geomEl) {
      inputEl = geomEl
      logExtension('info', 'rpa-visual', 'Campo de texto da mensagem localizado geometricamente.')
    } else {
      for (const sel of INPUT_SELECTORS) {
        const el = document.querySelector(sel) as HTMLDivElement
        if (el) { inputEl = el; break }
      }
    }

    if (!inputEl) {
      logExtension('error', 'rpa-visual', 'Campo de mensagem não encontrado no DOM via geometria ou seletores!')
      return false
    }

    logExtension('info', 'rpa-visual', 'Campo de texto encontrado. Digitando mensagem...')

    // ── Passo 2: Focar e posicionar cursor no final ──
    inputEl.focus()
    await new Promise(r => setTimeout(r, 200))

    // ── Passo 3: Inserir o texto da mensagem usando a injeção Lexical (Infalível) ──
    await inserirTextoNoLexical(inputEl, mensagem, 'replace')

    // ── Passo 4: Aguardar o botão de enviar aparecer ──
    const savedDelayDigitar = localStorage.getItem("crm_delay_digitar")
    const delayDigitar = savedDelayDigitar ? parseFloat(savedDelayDigitar) * 1000 : 800
    await new Promise(r => setTimeout(r, delayDigitar))

    // ── Passo 5: Encontrar e clicar no botão de enviar com múltiplos seletores ──
    const SEND_SELECTORS = [
      'button[data-testid="compose-btn-send"]',
      'footer button[aria-label="Enviar"]',
      'footer button[aria-label="Send"]',
      'footer span[data-icon="send"]',
      '[data-testid="send"]',
      'footer button:last-of-type',
    ]

    let sendBtn: HTMLElement | null = null
    for (const sel of SEND_SELECTORS) {
      const el = document.querySelector(sel)
      if (el) {
        // Se achou um span, sobe para o botão pai
        sendBtn = (el.tagName === 'BUTTON' ? el : el.closest('button')) as HTMLElement || el as HTMLElement
        if (sendBtn) { logExtension('info', 'rpa-visual', `Botão de enviar encontrado: ${sel}`); break }
      }
    }

    if (sendBtn) {
      // Emulação física completa
      sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
      sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
      sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      setTimeout(() => { try { (sendBtn as HTMLElement).click() } catch (e) {} }, 100)
      logExtension('info', 'rpa-visual', 'Mensagem enviada com sucesso!')
      return true
    }

    // Última tentativa: pressionar Enter no campo de texto
    logExtension('warn', 'rpa-visual', 'Botão de enviar não encontrado. Tentando Enter...')
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))
    inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
    await new Promise(r => setTimeout(r, 300))
    return true
  }

  // Verifica se o cliente respondeu (última mensagem no chat ou indicador visual)
  const verificarSeClienteRespondeu = (): boolean => {
    // 1. Busca todas as mensagens visíveis na conversa ativa
    const messages = document.querySelectorAll('[class*="message-in"], [class*="message-out"]');
    if (messages.length > 0) {
      const ultimaMensagem = messages[messages.length - 1];
      if (ultimaMensagem) {
        // Se a última mensagem tem classe contendo message-in ou seletor de mensagem recebida
        const isClientMsg = ultimaMensagem.classList.contains('message-in') || 
                            ultimaMensagem.className.includes('message-in') ||
                            ultimaMensagem.querySelector('[data-id*="false"]');
        if (isClientMsg) {
          console.log('[RPA] Resposta detectada: A última mensagem do chat é do cliente.');
          return true;
        }
      }
    }
    
    // 2. Busca pela barra divisória de "Mensagens não lidas" no chat ativo
    const unreadBar = document.querySelector('div._am78, div.unread-bar, span[aria-label*="não lida"]');
    if (unreadBar) {
      console.log('[RPA] Resposta detectada: Indicador de não lidas encontrado.');
      return true;
    }

    return false;
  }

  // Helper para comparar números brasileiros de forma resiliente ao nono dígito (comprimento 12 vs 13)
  const compararNumerosBrasileiros = (num1: string, num2: string): boolean => {
    const n1 = normalizarNumeroRPA(num1)
    const n2 = normalizarNumeroRPA(num2)
    
    if (n1 === n2) return true
    
    if (n1.startsWith('55') && n2.startsWith('55')) {
      const semDDI1 = n1.substring(2)
      const semDDI2 = n2.substring(2)
      
      const extrairPadrao = (semDDI: string): string => {
        // Se tem 11 dígitos (com o 9) e o terceiro dígito é 9, remove o 9 para normalizar em 10 dígitos (DDD + 8 dígitos)
        if (semDDI.length === 11 && semDDI[2] === '9') {
          return semDDI.substring(0, 2) + semDDI.substring(3)
        }
        return semDDI
      }
      
      return extrairPadrao(semDDI1) === extrairPadrao(semDDI2)
    }
    
    return false
  }

  // Disparador Automático da Mensagem
  const enviarMensagemWhatsApp = async (numero: string, mensagem: string, agendamento: any): Promise<string> => {
    const numNormalizado = normalizarNumeroRPA(numero)
    logExtension('info', 'rpa-envio', `Iniciando envio automático para: ${numNormalizado} (original: ${numero})`)
    
    // ── ESTRATÉGIA SUPREMA: ENVIO SILENCIOSO EM SEGUNDO PLANO ──
    try {
      logExtension('info', 'rpa-envio', `Tentando envio silencioso em segundo plano para: ${numNormalizado}...`)
      const responseId = Math.random().toString(36).substring(7)
      
      const envioSilenciosoPromessa = new Promise<boolean>((resolve) => {
        const handler = (e: MessageEvent) => {
          if (e.source !== window) return
          if (e.data && e.data.type === "CRM_ENVIAR_MENSAGEM_SILENCIOSA_RESPOSTA" && e.data.id === responseId) {
            window.removeEventListener("message", handler)
            resolve(e.data.sucesso)
          }
        }
        window.addEventListener("message", handler)
        
        // Timeout de 4 segundos para o envio silencioso
        setTimeout(() => {
          window.removeEventListener("message", handler)
          resolve(false)
        }, 4000)
      })

      window.postMessage({ 
        type: "CRM_ENVIAR_MENSAGEM_SILENCIOSA", 
        id: responseId, 
        numero: numNormalizado, 
        mensagem 
      }, "*")

      const sucessoSilencioso = await envioSilenciosoPromessa
      if (sucessoSilencioso) {
        logExtension('info', 'rpa-envio', `Sucesso absoluto! Mensagem enviada silenciosamente em segundo plano para ${numNormalizado}.`)
        return 'enviado'
      }
      logExtension('warn', 'rpa-envio', `Envio silencioso falhou ou expirou. Caindo para a estratégia de fallback do RPA visual...`)
    } catch (err) {
      logExtension('error', 'rpa-envio', `Erro na tentativa de envio silencioso. Caindo para o RPA visual:`, err)
    }

    let chatAtual = getActiveChatInfo()
    let numChatAtualNormalizado = normalizarNumeroRPA(chatAtual.numero)

    // Se a conversa correta não estiver aberta, o robô abre ela primeiro!
    if (!numChatAtualNormalizado || !compararNumerosBrasileiros(numChatAtualNormalizado, numNormalizado)) {
      const nomeParaBusca = agendamento ? (agendamento.cliente || agendamento.nome) : ""
      logExtension('info', 'rpa-envio', `Chat correto não está aberto (atual: ${numChatAtualNormalizado || 'Nenhum'}). Solicitando abertura de chat para: ${numNormalizado}`)
      const abriu = await abrirConversa(numNormalizado, nomeParaBusca)
      if (!abriu) {
        logExtension('error', 'rpa-envio', `Erro: Não foi possível abrir o chat de ${numNormalizado}`)
        return 'falhou'
      }

      // Polling de Ativação do Chat
      logExtension('info', 'rpa-envio', `Aguardando confirmação visual do chat ativo para: ${numNormalizado}...`)
      let confirmado = false
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 300))
        chatAtual = getActiveChatInfo()
        numChatAtualNormalizado = normalizarNumeroRPA(chatAtual.numero)
        if (numChatAtualNormalizado && compararNumerosBrasileiros(numChatAtualNormalizado, numNormalizado)) {
          confirmado = true
          logExtension('info', 'rpa-envio', `Confirmado! Chat de ${numNormalizado} carregado no cabeçalho com sucesso.`)
          break
        }
      }

      if (!confirmado) {
        logExtension('warn', 'rpa-envio', `Aviso: Cabeçalho não atualizou a tempo para o número ${numNormalizado}. Prosseguindo com cautela...`)
      }
    }

    // Aguarda um momento adicional curto (600ms)
    await new Promise(r => setTimeout(r, 600))

    // Se estiver configurado para pausar se o cliente responder, faz a checagem
    if (agendamento && agendamento.cancelarSeResponder) {
      const respondeu = verificarSeClienteRespondeu()
      if (respondeu) {
        logExtension('info', 'rpa-envio', `Envio cancelado porque o cliente respondeu!`)
        return 'cliente_respondeu'
      }
    }

    // Digita e envia a mensagem de fato
    const enviado = await digitarESend(mensagem)
    if (enviado) {
      logExtension('info', 'rpa-envio', `Mensagem enviada via RPA visual com sucesso!`)
      return 'enviado'
    } else {
      logExtension('error', 'rpa-envio', `Erro ao disparar clique de envio visual.`)
      return 'falhou'
    }
  }

  // Varre a barra lateral esquerda do WhatsApp Web e mapeia os contatos ativos
  const obterContatosRecentes = () => {
    const contatosCache = obterContatosCache()
    const contatosMap = new Map<string, { nome: string; foto: string }>() // mapa de numero -> { nome, foto }

    // 1. Carrega contatos com nome real do cache (prioridade máxima)
    contatosCache.forEach((c: any) => {
      if (c.numero && c.nome) {
        const numLimpo = c.numero.replace(/\D/g, '')
        if (numLimpo && !/^\+?[\d\s\-()]+$/.test(c.nome.trim())) {
          contatosMap.set(numLimpo, { nome: c.nome, foto: c.foto || '' })
        }
      }
    })

    // 2. Carrega contatos sem nome do cache (fallback numérico)
    contatosCache.forEach((c: any) => {
      if (c.numero) {
        const numLimpo = c.numero.replace(/\D/g, '')
        if (numLimpo && !contatosMap.has(numLimpo)) {
          contatosMap.set(numLimpo, { nome: c.nome || numLimpo, foto: c.foto || '' })
        }
      }
    })

    // 3. Varre as linhas do pane lateral de chats do WhatsApp Web no momento
    // Usa MÚLTIPLOS seletores para capturar tanto as linhas antigas quanto as novas do DOM do WhatsApp
    const chatRowSelectors = [
      '#pane-side div[role="row"]',
      '#pane-side div[role="listitem"]',
      '#pane-side li',
    ]

    let chatRows: NodeListOf<Element> | null = null
    for (const sel of chatRowSelectors) {
      const rows = document.querySelectorAll(sel)
      if (rows.length > 0) { chatRows = rows; break }
    }

    if (chatRows) {
      chatRows.forEach(row => {
        let nome = ''
        let numero = ''
        let foto = ''

        // Extrair imagem do DOM
        const imgEl = row.querySelector('img')
        if (imgEl) {
          foto = imgEl.getAttribute('src') || ''
        }

        // ── Extrair VIA REACT FIBER (MÉTODO SUPREMO E MAIS CONFIÁVEL) ──
        const fiberData = getContactFromFiber(row)
        if (fiberData) {
          nome = fiberData.nome
          numero = fiberData.numero
        }

        // ── Fallback para extração visual DOM (se Fiber falhar ou se o nome for apenas o número) ──
        if (!nome || !numero || nome === numero || /^[0-9]+$/.test(nome.replace(/\D/g, ''))) {
          // Método 1: span com atributo title
          let possivelNome = ''
          const titleEl = row.querySelector('span[title]')
          if (titleEl) {
            possivelNome = titleEl.getAttribute('title') || titleEl.textContent || ''
          }
          if (!possivelNome || possivelNome === numero || /^[0-9]+$/.test(possivelNome.replace(/\D/g, ''))) {
            const dirEl = row.querySelector('span[dir="auto"]')
            if (dirEl) possivelNome = dirEl.textContent || ''
          }
          possivelNome = possivelNome.trim()
          
          // Aceita o possível nome mesmo se for numérico
          if (possivelNome) {
            nome = possivelNome
          }
        }

        // ── Extrair NÚMERO via múltiplos métodos ──

        // Método A: data-id no próprio elemento row (JID: numero@c.us)
        const rowDataId = (row as HTMLElement).getAttribute('data-id') ||
                          row.querySelector('[data-id]')?.getAttribute('data-id') || ''
        if (rowDataId && rowDataId.includes('@c.us')) {
          numero = rowDataId.split('@')[0]
        }

        // Método B: qualquer atributo que contenha @c.us
        if (!numero) {
          const allEls = row.querySelectorAll('*')
          for (const el of Array.from(allEls)) {
            for (const attr of Array.from(el.attributes)) {
              if (attr.value.includes('@c.us') && !attr.value.includes('@g.us')) {
                const extracted = attr.value.split('@')[0].replace(/\D/g, '')
                if (extracted && extracted.length >= 8) {
                  numero = extracted
                  break
                }
              }
            }
            if (numero) break
          }
        }

        // Método C: img src com parâmetro ?u= ou &u= (método antigo mas ainda válido em alguns casos)
        if (!numero) {
          const imgEl = row.querySelector('img')
          if (imgEl) {
            const src = imgEl.getAttribute('src') || ''
            const match = src.match(/[?&]u=([^&%]+)/)
            if (match) numero = match[1].split('@')[0]
          }
        }

        // Método D: Se o nome for um número de telefone formatado, usa o próprio nome como número
        if (!numero && nome && /^\+?[\d\s\-()]+$/.test(nome)) {
          numero = nome.replace(/\D/g, '')
          nome = '' // Não tem nome real, descarta
        }

        // Ignora grupos (@g.us) e verifica tamanho mínimo do número
        if (numero) {
          const numLimpo = numero.replace(/\D/g, '')
          if (numLimpo.length >= 8 && numLimpo.length <= 15) {
            // Se tem nome real (não só número), salva com prioridade
            if (nome && !/^\+?[\d\s\-()]+$/.test(nome)) {
              contatosMap.set(numLimpo, { nome, foto: foto || contatosMap.get(numLimpo)?.foto || '' })
            } else if (!contatosMap.has(numLimpo)) {
              // Sem nome real: salva o número formatado como placeholder
              contatosMap.set(numLimpo, { nome: nome || numLimpo, foto: foto || '' })
            }
          }
        }
      })
    }

    // 4. Obtém o chat ativo atual e adiciona/atualiza no mapa
    const chatAtual = getActiveChatInfo()
    if (chatAtual.nome && chatAtual.numero &&
        chatAtual.nome !== 'Nenhum contato selecionado' &&
        chatAtual.nome !== 'Conversa Sem Nome') {
      const numLimpo = chatAtual.numero.replace(/\D/g, '')
      if (numLimpo) {
        let activeFoto = ''
        const header = document.querySelector('header')
        const headerImg = header?.querySelector('img')
        if (headerImg) {
          activeFoto = headerImg.getAttribute('src') || ''
        }
        contatosMap.set(numLimpo, { nome: chatAtual.nome, foto: activeFoto || contatosMap.get(numLimpo)?.foto || '' })
      }
    }

    // 5. Converte o mapa em array, ordenando por: nomes reais primeiro, números depois
    const contatosAtualizados: { nome: string; numero: string; foto: string }[] = []
    contatosMap.forEach((val, numero) => {
      contatosAtualizados.push({ nome: val.nome, numero, foto: val.foto || '' })
    })

    // Ordena: contatos com nome real (não numérico) primeiro
    contatosAtualizados.sort((a, b) => {
      const aTemNome = !/^\+?[\d\s\-()]+$/.test(a.nome)
      const bTemNome = !/^\+?[\d\s\-()]+$/.test(b.nome)
      if (aTemNome && !bTemNome) return -1
      if (!aTemNome && bTemNome) return 1
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })

    // 6. Salva a lista mesclada no cache
    salvarContatosCache(contatosAtualizados)

    // 7. Coloca o chat ativo no topo se disponível
    if (chatAtual.nome && chatAtual.numero &&
        chatAtual.nome !== 'Nenhum contato selecionado' &&
        chatAtual.nome !== 'Conversa Sem Nome') {
      const numLimpo = chatAtual.numero.replace(/\D/g, '')
      let activeFoto = ''
      const header = document.querySelector('header')
      if (header) {
        activeFoto = header.querySelector('img')?.getAttribute('src') || ''
      }
      const listaSemAtivo = contatosAtualizados.filter(c => c.numero.replace(/\D/g, '') !== numLimpo)
      listaSemAtivo.unshift({ nome: chatAtual.nome, numero: chatAtual.numero, foto: activeFoto })
      return listaSemAtivo
    }

    return contatosAtualizados
  }

  const [activeChat, setActiveChat] = useState({ nome: '', numero: '' })


  // Sidebar Direita Injetada sobre o WhatsApp
  return (
    <>
      {/* Barra Lateral Direita */}
      <div className="fixed top-0 right-0 h-full w-[60px] bg-white border-l border-gray-200 shadow-xl z-[99999] flex flex-col items-center py-4 gap-4" style={{fontFamily: 'Inter, sans-serif'}}>
        
        {/* Logo GPPREMIUM */}
        <div className="w-11 h-11 flex items-center justify-center bg-gray-50 rounded-xl overflow-hidden shadow-sm border border-gray-100 mb-1 p-0.5">
          <img 
            src={logoUrl} 
            alt="GPPREMIUM Logo" 
            className="w-full h-full object-contain"
          />
        </div>

        {/* Divisor */}
        <div className="w-8 h-[1px] bg-gray-200"></div>

        {/* Ícone de Dashboard / Lista */}
        <button 
          onClick={() => {
            setShowConfig(false)
            setShowMensagensRapidas(false)
            setShowDashboard(!showDashboard)
          }}
          className={`p-3 rounded-xl transition ${showDashboard ? 'text-[#00a884] bg-green-50' : 'text-gray-500 hover:text-[#00a884] hover:bg-green-50'}`}
          title="Dashboard GPPREMIUM"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        </button>

        {/* Divisor */}
        <div className="w-8 h-[1px] bg-gray-200 my-1"></div>

        {/* Ícone de Mensagens Rápidas (Raio/Templates) */}
        <button 
          onClick={() => {
            setShowDashboard(false)
            setShowConfig(false)
            setShowMensagensRapidas(!showMensagensRapidas)
          }}
          className={`p-3 rounded-xl transition ${showMensagensRapidas ? 'text-[#00a884] bg-green-50' : 'text-gray-500 hover:text-[#00a884] hover:bg-green-50'}`}
          title="Mensagens Pré-definidas"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <path d="M13 8l-2 4h3l-2 4"/>
          </svg>
        </button>
 
        {/* Divisor */}
        <div className="w-8 h-[1px] bg-gray-200 my-1"></div>
 
        {/* Ícone de Agendar (Calendário) */}
        <button 
          onClick={() => {
            const contatos = obterContatosRecentes()
            setContatosRecentes(contatos)
            const info = getActiveChatInfo()
            setActiveChat(info)
            setShowModal(true)
          }}
          className="p-3 text-gray-500 hover:text-[#00a884] hover:bg-green-50 rounded-xl transition"
          title="Agendar Mensagem"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="15" cy="16" r="3"/><polyline points="15 14.5 15 16 16 17"/></svg>
        </button>
 
        {/* Espaçador flexível para empurrar configurações pro fundo */}
        <div className="flex-1"></div>
 
        {/* Ícone de Configurações */}
        <button 
          onClick={() => {
            setShowDashboard(false)
            setShowMensagensRapidas(false)
            setShowConfig(!showConfig)
          }}
          className={`p-3 rounded-xl transition ${showConfig ? 'text-[#00a884] bg-green-50' : 'text-gray-400 hover:text-[#00a884] hover:bg-green-50'}`}
          title="Configurações"
        >

          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>

        {/* Divisor */}
        <div className="w-8 h-[1px] bg-gray-200 my-1"></div>

        {/* Informações e Logout do Usuário Logado */}
        {usuarioLogado ? (
          <div className="flex flex-col items-center gap-2 mb-2 w-full px-1">
            {/* Avatar circular com iniciais */}
            <div 
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md"
              style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                boxShadow: '0 4px 10px rgba(139, 92, 246, 0.2)'
              }}
              title={`Atendente conectado: ${usuarioLogado.nome} (${usuarioLogado.email})`}
            >
              {usuarioLogado.nome ? usuarioLogado.nome.split(' ').map((n: any) => n[0]).slice(0, 2).join('').toUpperCase() : 'OP'}
            </div>

            {/* Botão explícito de Sair (Logout) */}
            <button 
              onClick={handleLogout}
              className="w-full flex flex-col items-center justify-center p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
              title={`Desconectar de: ${usuarioLogado.nome}`}
            >
              {/* Ícone de Log-Out clássico da web */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span className="text-[9px] font-semibold mt-0.5 uppercase tracking-wide">Sair</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 mb-2 w-full px-1">
            {/* Botão explícito de Entrar (Login) caso esteja deslogado */}
            <button 
              onClick={() => {
                setLoginError("");
                setLoginEmail("");
                setLoginSenha("");
              }}
              className="w-full flex flex-col items-center justify-center p-1 rounded-lg text-gray-400 hover:text-[#00a884] hover:bg-green-50 transition"
              title="Realizar Login no CRM"
            >
              {/* Ícone de Log-In clássico */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2-2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              <span className="text-[9px] font-semibold mt-0.5 uppercase tracking-wide">Entrar</span>
            </button>
          </div>
        )}
      </div>
 
      {/* Modal de Login Flutuante */}
      {!usuarioLogado && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(10, 10, 15, 0.75)',
          backdropFilter: 'blur(10px)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{
            width: '400px',
            background: 'rgba(25, 25, 35, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            padding: '2.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            color: '#f3f4f6',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            textAlign: 'center'
          }}>
            <div>
              {/* Logo Oficial Arredondado */}
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                overflow: 'hidden',
                margin: '0 auto 1rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'white',
                border: '2px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 0 20px rgba(14, 70, 163, 0.3)'
              }}>
                <img 
                  src={logoUrl} 
                  alt="GP PREMIUM Logo" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.2rem 0', background: 'linear-gradient(135deg, #0e46a3 0%, #e21b24 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>GP PREMIUM</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Entre com suas credenciais do CRM para continuar</p>
            </div>

            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>E-mail</label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Ex: vendedor@crm.com"
                  style={{
                    width: '100%',
                    background: 'rgba(30, 30, 45, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    padding: '0.8rem 1rem',
                    color: 'white',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>Senha</label>
                <input
                  type="password"
                  required
                  value={loginSenha}
                  onChange={(e) => setLoginSenha(e.target.value)}
                  placeholder="Senha"
                  style={{
                    width: '100%',
                    background: 'rgba(30, 30, 45, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    padding: '0.8rem 1rem',
                    color: 'white',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>

              {loginError && (
                <p style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 500, margin: '0' }}>{loginError}</p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                style={{
                  background: 'linear-gradient(135deg, #0e46a3 0%, #e21b24 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.9rem',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 15px rgba(14, 70, 163, 0.3)'
                }}
              >
                {loginLoading ? 'Carregando...' : 'Entrar no Sistema'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Renderiza o modal se ativo */}
      {showModal && (
        <ModalAgendamento 
          onClose={() => setShowModal(false)} 
          usuarioId={usuarioId} 
          contatoNome={activeChat.nome === 'Conversa Sem Nome' ? '' : activeChat.nome}
          contatoNumero={activeChat.numero}
          contatosDisponiveis={contatosRecentes}
        />
      )}
      
      {/* Renderiza o dashboard se ativo */}
      {showDashboard && (
        <Dashboard 
          agendamentos={agendamentos} 
          onClose={() => setShowDashboard(false)} 
          contatosDisponiveis={obterContatosRecentes()}
          onDelete={async (id) => {
            try {
              const res = await fetch(`http://localhost:3000/api/agendamentos/${id}`, {
                method: 'DELETE'
              })
              if (!res.ok) throw new Error("Erro ao deletar")
            } catch (err) {
              console.error(err)
              alert("Não foi possível excluir o agendamento.")
            }
          }}
          onEdit={async (id, dados) => {
            try {
              const res = await fetch(`http://localhost:3000/api/agendamentos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
              })
              if (!res.ok) throw new Error("Erro ao editar")
            } catch (err) {
              console.error(err)
              alert("Não foi possível salvar a alteração.")
            }
          }}
        />
      )}

      {/* Renderiza as configurações se ativo */}
      {showConfig && (
        <Configuracoes 
          onClose={() => setShowConfig(false)} 
        />
      )}

      {/* Renderiza as mensagens pré-definidas se ativo */}
      {showMensagensRapidas && (
        <MensagensRapidas 
          onClose={() => setShowMensagensRapidas(false)} 
          filtroInicial={filtroMensagens}
          onSelectTemplate={(texto) => {
            const inputEl = document.querySelector('footer div[contenteditable="true"]') as HTMLDivElement
            if (inputEl) {
              // 1. Foca o elemento principal de input
              inputEl.focus()
              
              // 2. Localiza o nó interno de texto real do WhatsApp Web (geralmente um parágrafo <p>)
              const targetNode = inputEl.querySelector('p') || inputEl
              
              // Usa a função assíncrona robusta do Lexical para limpar o atalho (se houver) e inserir o texto final
              inserirTextoNoLexical(targetNode, texto, 'replace').then(() => {
                inputEl.dispatchEvent(new Event('input', { bubbles: true }))
                targetNode.dispatchEvent(new Event('input', { bubbles: true }))
              })
              
              // 7. Limpa o filtro de mensagens
              setFiltroMensagens("")
              
              // 8. Garante foco definitivo para o vendedor poder continuar editando/enviando
              setTimeout(() => {
                inputEl.focus()
              }, 50)
            } else {
              alert("Por favor, abra uma conversa no WhatsApp antes de usar uma mensagem rápida!")
            }
          }}
        />
      )}


    </>
  )
}

export default WhatsAppCRM
