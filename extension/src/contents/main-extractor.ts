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
            (require: any) => {
              let extractedContacts: any[] = []
              const modules = require.c
              for (const k in modules) {
                try {
                  const m = modules[k].exports
                  if (!m) continue;

                  // Tenta acessar m.getModelsArray ou m.default.getModelsArray ou m.models
                  const storesToTry = [m, m.default, m.Contact, m.default?.Contact].filter(Boolean)
                  
                  for (const store of storesToTry) {
                    let models: any[] = []
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
                            if (!isSaved) return null

                            const numero = jid.split('@')[0]
                            if (!numero || isNaN(Number(numero))) return null

                            const nome = c.name
                            if (!nome || nome.trim() === '') return null

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

// Executa assim que o documento está pronto
extrairContatosIndexedDB()

// Escuta pedidos de re-extração e envios silenciosos do content script principal
window.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "CRM_EXTRAIR_CONTATOS") {
    logMain("info", "Re-extração de contatos solicitada pelo content script.")
    extrairContatosIndexedDB()
  }

  if (event.data && event.data.type === "CRM_ENVIAR_MENSAGEM_SILENCIOSA") {
    // Ignorado pois o envio agora é via backend
  }
})

// Re-executa a cada 60 segundos para capturar novos contatos abertos
setInterval(extrairContatosIndexedDB, 60000)
