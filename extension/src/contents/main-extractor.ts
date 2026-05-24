import type { PlasmoCSConfig } from "plasmo"

// Este script roda no MAIN world do Chrome, tendo acesso direto ao IndexedDB do WhatsApp Web
// É a forma segura de contornar a restrição de CSP sem precisar injetar scripts inline

export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"],
  world: "MAIN",
  run_at: "document_idle"
}

// Envia logs de depuração em tempo real direcionados ao backend
const logMain = (nivel: 'info' | 'warn' | 'error', mensagem: string, erro?: any) => {
  try {
    window.postMessage({
      type: "CRM_LOG",
      nivel,
      escopo: "main-world",
      mensagem,
      erro: erro ? { message: erro.message, stack: erro.stack } : undefined
    }, "*");
  } catch (e) {
    console.error("[CRM-Main-Logs-Fallback]", mensagem, erro || "");
  }
}

const extrairContatosIndexedDB = async () => {
    // Lista de bancos conhecidos no WA Web
    const dbNames = ["model-storage", "wa-web-db", "wa-web", "wawc", "whatsapp-web"]
    
    // Tenta usar a API nativa primeiro para achar o banco correto
    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases()
        dbs.forEach(db => {
          if (db.name && !dbNames.includes(db.name)) dbNames.push(db.name)
        })
      }
    } catch(e) {}

    let extracted = false

    for (const dbName of dbNames) {
      if (extracted) break;

      await new Promise<void>((resolve) => {
        const request = indexedDB.open(dbName)
        
        request.onerror = () => resolve()
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          try {
            if (!db.objectStoreNames.contains("contact")) {
              db.close()
              resolve()
              return
            }

            const transaction = db.transaction("contact", "readonly")
            const store = transaction.objectStore("contact")
            const getAllReq = store.getAll()

            getAllReq.onsuccess = () => {
              const records = getAllReq.result
              db.close()

              if (!Array.isArray(records)) {
                resolve()
                return
              }

              const contatosValidos = records
                .map(rec => {
                  const id = rec.id || ""
                  if (!id || id.includes("@g.us") || id.includes("-")) return null
                  const numero = id.split("@")[0]
                  if (!numero || isNaN(Number(numero))) return null
                  
                  // Ignora IDs gigantes (maiores que 13 dígitos) que pertencem a bots oficiais de serviços 
                  // do WhatsApp, canais de transmissão ou newsletters corporativas.
                  if (numero.length > 13) return null

                  // O usuário quer apenas OS CONTATOS SALVOS NA AGENDA (não pessoas aleatórias de grupos)
                  const isSavedContact = Boolean(rec.name || rec.isMyContact)
                  if (!isSavedContact) return null

                  const nome = rec.name || rec.pushname || rec.formattedName || numero
                  // Só adiciona se o nome for de fato um nome (e não apenas o número repetido)
                  if (!nome || nome === numero || nome.trim() === '') return null

                  return { nome: nome.trim(), numero: numero }
                })
                .filter(Boolean)

              if (contatosValidos.length > 0) {
                logMain("info", `Extraídos ${contatosValidos.length} contatos do banco ${dbName}.`)
                window.postMessage({ type: "CRM_CONTATOS_EXTRAIDOS", contatos: contatosValidos }, "*")
                extracted = true
              }
              resolve()
            }

            getAllReq.onerror = () => {
              db.close()
              resolve()
            }
          } catch (e) {
            db.close()
            resolve()
          }
        }
      })
    }
    
    if (!extracted) {
      logMain("info", "Nenhum contato no IndexedDB. Tentando Webpack...")
      try {
        const id = Math.random().toString(36).substring(7)
        if (window.webpackChunkwhatsapp_web_client) {
          window.webpackChunkwhatsapp_web_client.push([
            [id],
            {},
            (require) => {
              let extractedContacts = []
              const modules = require.c
              for (const k in modules) {
                try {
                  const m = modules[k].exports
                  if (!m) continue;

                  // Tenta acessar m.getModelsArray ou m.default.getModelsArray ou m.models
                  const storesToTry = [m, m.default, m.Contact, m.default?.Contact].filter(Boolean)
                  
                  for (const store of storesToTry) {
                    let models = []
                    if (typeof store.getModelsArray === 'function') {
                      models = store.getModelsArray()
                    } else if (Array.isArray(store.models)) {
                      models = store.models
                    } else if (typeof store.getModels === 'function') {
                      models = store.getModels()
                    }

                    if (models && models.length > 5) {
                      const firstId = models[0].id ? (models[0].id._serialized || models[0].id) : ''
                      // Verifica se parece um array de contatos
                      if (typeof firstId === 'string' && firstId.includes('@c.us')) {
                        extractedContacts = models.map(c => {
                          const jid = c.id?._serialized || c.id || ''
                          if (typeof jid === 'string' && jid.includes('@c.us')) {
                            // Filtro rígido para pegar APENAS contatos salvos na agenda
                            const isSaved = Boolean(c.name || c.isMyContact)
                            if (!isSaved) return

                            const numero = jid.split('@')[0]
                            if (!numero || isNaN(Number(numero))) return

                            const nome = c.name
                            if (!nome || nome.trim() === '') return

                            return { nome: nome.trim(), numero: numero }
                          }
                          return null
                        }).filter(Boolean)
                        break
                      }
                    }
                  }
                  if (extractedContacts.length > 0) break;
                } catch(e) {}
              }

              if (extractedContacts.length > 0) {
                logMain("info", `Extraídos ${extractedContacts.length} contatos via Webpack Agressivo.`)
                window.postMessage({ type: "CRM_CONTATOS_EXTRAIDOS", contatos: extractedContacts }, "*")
              } else {
                logMain("warn", "Falha ao extrair contatos via Webpack Agressivo.")
              }
            }
          ])
        }
      } catch (e) {
        logMain("error", "Erro no fallback Webpack de contatos", e)
      }
    }
}

const obterStoresDoWebpack = (): any => {
  let Store: any = (window as any).Store || {};
  if (Store.Chat && (Store.sendTextMsgToChat || Store.sendMessageToChat)) {
    return Store;
  }

  logMain("info", "Iniciando varredura dinâmica de Stores do Webpack...");

  try {
    const id = "crm-dynamic-store-finder-" + Math.random().toString(36).substring(7);
    if (window.webpackChunkwhatsapp_web_client) {
      window.webpackChunkwhatsapp_web_client.push([
        [id],
        {},
        (require) => {
          const modules = require.c || {};
          const tempStore: any = {};
          
          const inspecionarModulo = (m: any) => {
            if (!m) return;
            const targets = [m, m.default, m.Chat, m.default?.Chat].filter(Boolean);
            for (const t of targets) {
              // 1. Identificar se é uma Coleção (Chat ou Contato) de forma altamente resiliente
              let models: any[] = [];
              let isCollection = false;

              if (typeof t.getModelsArray === 'function') {
                try { models = t.getModelsArray(); isCollection = true; } catch (e) {}
              } else if (Array.isArray(t.models)) {
                models = t.models;
                isCollection = true;
              } else if (typeof t.getModels === 'function') {
                try { models = t.getModels(); isCollection = true; } catch (e) {}
              }

              if (isCollection || (t.model && t.model.prototype)) {
                const constructorName = t.constructor?.name || "";
                
                // Detecção robusta baseada no conteúdo da coleção OU no protótipo do modelo de classe OU nome da classe
                const isChatStore = 
                  (models && models.length > 0 && (
                    models[0].msgs || 
                    models[0].unreadCount !== undefined || 
                    models[0].isGroup !== undefined || 
                    (models[0].id?._serialized && (models[0].id._serialized.includes('@c.us') || models[0].id._serialized.includes('@g.us')))
                  )) ||
                  (t.model && t.model.prototype && (
                    t.model.prototype.sendMessage || 
                    t.model.prototype.sendMsg || 
                    t.model.prototype.isGroup !== undefined
                  )) ||
                  constructorName.includes("ChatCollection");

                if (isChatStore && !tempStore.Chat) {
                  tempStore.Chat = t;
                  logMain("info", "Store.Chat localizada com sucesso de forma flexível!");
                }
                
                const isContactStore = 
                  (models && models.length > 0 && (
                    models[0].isMyContact !== undefined || 
                    models[0].isUser !== undefined
                  )) ||
                  (t.model && t.model.prototype && (
                    t.model.prototype.isMyContact !== undefined || 
                    t.model.prototype.isUser !== undefined
                  )) ||
                  constructorName.includes("ContactCollection");

                if (isContactStore && !tempStore.Contact) {
                  tempStore.Contact = t;
                  logMain("info", "Store.Contact localizada com sucesso de forma flexível!");
                }
              }
              
              // 2. Identificar WidFactory
              if (t.createWid || t.createUserWid) {
                tempStore.WidFactory = t;
              }

              // 3. Identificar funções de Envio de Mensagem
              if (typeof t.sendTextMsgToChat === 'function') {
                tempStore.sendTextMsgToChat = t.sendTextMsgToChat;
                logMain("info", "Função sendTextMsgToChat localizada!");
              }
              if (typeof t.sendMessageToChat === 'function') {
                tempStore.sendMessageToChat = t.sendMessageToChat;
                logMain("info", "Função sendMessageToChat localizada!");
              }
              if (typeof t.sendMsg === 'function') {
                tempStore.sendMsg = t.sendMsg;
              }
            }
          };

          // Passo A: Varrer os módulos já carregados em require.c
          for (const k in modules) {
            try {
              inspecionarModulo(modules[k].exports);
            } catch (e) {}
          }

          // Passo B: Se ainda não localizou as stores vitais, varrer require.m (todos os módulos cadastrados no Webpack!)
          if (!tempStore.Chat || (!tempStore.sendTextMsgToChat && !tempStore.sendMessageToChat)) {
            logMain("warn", "Módulos vitais ausentes em require.c. Varrendo require.m de forma agressiva...");
            const allModules = require.m;
            let countLoaded = 0;
            
            for (const k in allModules) {
              if (tempStore.Chat && (tempStore.sendTextMsgToChat || tempStore.sendMessageToChat)) {
                break;
              }
              if (modules[k]) continue;
              
              try {
                const exported = require(k);
                inspecionarModulo(exported);
                countLoaded++;
              } catch (e) {}
            }
            logMain("info", `Varredura agressiva concluída. ${countLoaded} novos módulos inspecionados.`);
          }

          // Imprime logs detalhados do resultado final da varredura
          const chavesEncontradas = Object.keys(tempStore);
          logMain("info", "Varredura de Stores concluída. Encontrados no Webpack: " + JSON.stringify(chavesEncontradas));

          // Salva/Mescla as Stores encontradas na window.Store global
          (window as any).Store = { ...((window as any).Store || {}), ...tempStore };
        }
      ]);
      Store = (window as any).Store;
    } else {
      logMain("error", "window.webpackChunkwhatsapp_web_client não está disponível no DOM.");
    }
  } catch (err) {
    logMain("error", "Erro crítico na injeção ou varredura de Stores do Webpack:", err);
  }

  return Store;
};

const enviarMensagemSilenciosa = async (numero: string, mensagem: string): Promise<boolean> => {
  try {
    logMain("info", `Tentando envio silencioso para o número: ${numero}`);
    
    // 1. Obtém as stores do Webpack
    const Store = obterStoresDoWebpack();

    if (!Store || !Store.Chat) {
      logMain("error", "Falha de Envio Silencioso: Módulos internos 'Store.Chat' não localizados no Webpack.");
      return false;
    }

    // Função interna para gerar variações resilientes com/sem o nono dígito brasileiro (se aplicável)
    const obterJIDsCandidatos = (num: string): string[] => {
      let limpo = num.replace(/\D/g, '');
      const lista: string[] = [];
      
      let baseJid = limpo;
      if (!baseJid.endsWith('@c.us') && !baseJid.endsWith('@g.us')) {
        baseJid = `${baseJid}@c.us`;
      }
      lista.push(baseJid);
      
      // Se for número brasileiro, gera a variação de nono dígito
      const numApenas = baseJid.split('@')[0];
      if (numApenas.startsWith('55')) {
        const semDDI = numApenas.substring(2);
        if (semDDI.length === 10) {
          // Caso clássico: 8 dígitos nacionais. Adiciona o 9 após o DDD de 2 dígitos.
          const ddd = semDDI.substring(0, 2);
          const resto = semDDI.substring(2);
          const alternativo = `55${ddd}9${resto}@c.us`;
          lista.push(alternativo);
        } else if (semDDI.length === 11 && semDDI[2] === '9') {
          // Caso clássico: 9 dígitos nacionais. Remove o 9 após o DDD de 2 dígitos.
          const ddd = semDDI.substring(0, 2);
          const resto = semDDI.substring(3);
          const alternativo = `55${ddd}${resto}@c.us`;
          lista.push(alternativo);
        }
      }
      
      // Remove duplicados mantendo a ordem
      return Array.from(new Set(lista));
    };

    const jids = obterJIDsCandidatos(numero);
    logMain("info", `JIDs candidatos para envio: ${JSON.stringify(jids)}`);
    
    let enviadoComSucesso = false;
    
    for (const jidCandidato of jids) {
      try {
        logMain("info", `Tentando envio silencioso para JID candidato: ${jidCandidato}`);
        
        let formattedJid: any = jidCandidato;
        if (Store.WidFactory && typeof Store.WidFactory.createWid === 'function') {
          try {
            formattedJid = Store.WidFactory.createWid(jidCandidato);
          } catch (err) {
            logMain("warn", `Erro ao criar WID para ${jidCandidato} via WidFactory. Usando string bruta.`, err);
          }
        }
        
        let chat = Store.Chat.get ? Store.Chat.get(formattedJid) : null;
        
        if (!chat && Store.Chat.models) {
          chat = Store.Chat.models.find((c: any) => c.id?._serialized === jidCandidato || c.id === jidCandidato);
        }
        
        if (!chat) {
          logMain("info", `Chat ${jidCandidato} não encontrado em cache local. Buscando no servidor...`);
          if (typeof Store.Chat.find === 'function') {
            try {
              chat = await Store.Chat.find(formattedJid);
            } catch (e) {
              logMain("warn", `Erro ao chamar Store.Chat.find para ${jidCandidato}:`, e);
            }
          }
        }
        
        if (!chat) {
          logMain("warn", `Não foi possível obter o objeto do chat para ${jidCandidato}. Tentando próximo candidato se houver...`);
          continue;
        }
        
        // 3. Envia a mensagem pelo método nativo disponível
        // Método A: sendTextMsgToChat
        if (typeof Store.sendTextMsgToChat === 'function') {
          await Store.sendTextMsgToChat(chat, mensagem);
          logMain("info", `Mensagem enviada com sucesso via sendTextMsgToChat para ${jidCandidato}!`);
          enviadoComSucesso = true;
          break;
        }
        
        // Método B: sendMessageToChat
        if (typeof Store.sendMessageToChat === 'function') {
          await Store.sendMessageToChat(chat, mensagem);
          logMain("info", `Mensagem enviada com sucesso via sendMessageToChat para ${jidCandidato}!`);
          enviadoComSucesso = true;
          break;
        }
        
        // Método C: sendMessage direto no modelo do chat
        if (typeof chat.sendMessage === 'function') {
          await chat.sendMessage(mensagem);
          logMain("info", `Mensagem enviada com sucesso via chat.sendMessage para ${jidCandidato}!`);
          enviadoComSucesso = true;
          break;
        }
        
        // Método D: sendMsg direto no modelo
        if (typeof chat.sendMsg === 'function') {
          await chat.sendMsg(mensagem);
          logMain("info", `Mensagem enviada com sucesso via chat.sendMsg para ${jidCandidato}!`);
          enviadoComSucesso = true;
          break;
        }
      } catch (err) {
        logMain("error", `Erro interno na tentativa de envio para ${jidCandidato}:`, err);
      }
    }
    
    if (enviadoComSucesso) {
      return true;
    }

    logMain("error", `Todos os métodos e candidatos de envio silencioso falharam para o número: ${numero}`);
    return false;
  } catch (err) {
    logMain("error", "Erro crítico interno durante a execução de enviarMensagemSilenciosa:", err);
    return false;
  }
};

// Executa assim que o documento está pronto
extrairContatosIndexedDB()

// Escuta pedidos de re-extração e envios silenciosos do content script principal
window.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "CRM_EXTRAIR_CONTATOS") {
    logMain("info", "Re-extração de contatos solicitada pelo content script.")
    extrairContatosIndexedDB()
  }

  if (event.data && event.data.type === "CRM_ENVIAR_MENSAGEM_SILENCIOSA") {
    const { id, numero, mensagem } = event.data;
    const sucesso = await enviarMensagemSilenciosa(numero, mensagem);
    window.postMessage({ 
      type: "CRM_ENVIAR_MENSAGEM_SILENCIOSA_RESPOSTA", 
      id, 
      sucesso 
    }, "*");
  }
})

// Re-executa a cada 60 segundos para capturar novos contatos abertos
setInterval(extrairContatosIndexedDB, 60000)
