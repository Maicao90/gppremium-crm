# 🤖 INSTRUÇÕES OBRIGATÓRIAS PARA TODAS AS IAs & AGENTES (AGENTS.md)

## 🛑 REGRA CRÍTICA Nº 1: NUNCA DERRUBAR O SERVIDOR OU O WHATSAPP
- O backend (`/root/whatsapp-crm/backend`) gerencia múltiplas sessões ativas do **WhatsApp Baileys** de clientes reais e atendentes em tempo de execução.
- **PROIBIDO:** Usar `pm2 stop`, `pm2 kill`, `pm2 restart` ou reiniciar o container Docker de banco sem necessidade.
- **OBRIGATÓRIO:** Para aplicar qualquer mudança no código do backend sem derrubar ou desconectar o WhatsApp, utilize **SEMPRE E EXCLUSIVAMENTE**:
  ```bash
  cd /root/whatsapp-crm/backend && PORT=3001 pm2 reload whatsapp-crm --update-env
  ```

---

## 🗄️ BANCO DE DADOS LOCAL (POSTGRESQL 16)
- **Localização:** Container Docker `gp-postgres-crm` na VPS (`2.24.212.146:5432`).
- **Persistência:** Volume `gp-garantia-test-pgdata` (NUNCA DELETAR).
- **Acesso pgAdmin / Externo:**
  - Host: `2.24.212.146` | Porta: `5432` | DB: `testdb` | User: `postgres` | Senha: `hM8ulbWecWeIp48Go2Rk7`
- **ORM:** Prisma (`prisma/schema.prisma`). Para sincronizar novos campos com segurança:
  ```bash
  npx prisma db push --skip-generate
  ```

---

## 🏷️ REGRAS DE NEGÓCIO & ROBÔ DE IA (BOT PNEUS)
- **Arquivo da Tabela Oficial:** `backend/src/data/tabelaPrecos.ts` (37 medidas com centavos exatos de 1x a 10x).
- **Promoções:** Medidas em destaque (ex: 175/70R13 a R$ 239, 175/65R14 a R$ 269, 185/60R15 a R$ 249, etc.).
- **Compre 3 e Leve 4:** Válida para `195/65 R15` e `225/45 R17` (com até 10% de desconto para 1 ou 2 pneus).
- **Desconto de 5% à Vista:** Oferecido para pagamento no PIX ou Dinheiro.
- **Garantia 50.000 KM:** Montagem, alinhamento e balanceamento cortesia.
- **Agendamento Automático:** Interceptar tag `[AGENDAR_VISITA: ...]` e salvar no PostgreSQL (`prisma.agendamento.create`).
- **Transbordo:** Tag `[TRANSFERIR_HUMANO]` e mensagens manuais de atendentes pausam o robô por 120 minutos.

---

## 🎨 DESIGN SYSTEM & FRONTEND
- **Diretório Frontend:** `/root/crm-de-anuncios/`
- **Build de Produção:** `/root/whatsapp-crm/backend/public/anuncios/`
- **Estilo:** **GP Navy Dark Premium** (Fundo `#0b101e`, Cards `#10192e`, Botões `#E8252C`, texto das mensagens recebidas `#ffffff` sobre `#1e293b`).
- **Comando de Deploy do Frontend:**
  ```bash
  cd /root/crm-de-anuncios && npm run build && cp -r dist/* /root/whatsapp-crm/backend/public/anuncios/
  ```

---

*Para a documentação técnica completa e detalhada, consulte o arquivo [ARQUITETURA_SISTEMA_GP_CRM.md](file:///c:/Users/MaiconBatn/OneDrive/Documentos/gppremium-crm-main/ARQUITETURA_SISTEMA_GP_CRM.md).*
