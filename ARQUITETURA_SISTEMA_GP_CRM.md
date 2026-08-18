# 📖 DOCUMENTAÇÃO MESTRA — GP PREMIUM CRM & WHATSAPP ENGINE

> **DOCUMENTO PARA DESENVOLVEDORES E AGENTES DE IA**  
> *Este documento descreve toda a infraestrutura, banco de dados, regras de negócio, tabelas de preços, fluxos de WhatsApp e comandos de manutenção segura para o GP Premium CRM.*

---

## 🛑 REGRA DE OURO INVIOLÁVEL: NUNCA DERRUBAR O SERVIDOR OU O WHATSAPP

1. **NUNCA execute `pm2 stop`, `pm2 kill` ou `pm2 restart`:**
   - Use **SEMPRE** o comando de reload suave sem interrupção de conexões:
     ```bash
     cd /root/whatsapp-crm/backend && PORT=3001 pm2 reload whatsapp-crm --update-env
     ```
2. **NUNCA delete arquivos da pasta de sessões do WhatsApp:**
   - As sessões do Baileys residem em `/root/whatsapp-crm/backend/auth_info_baileys/`. Elas mantêm o WhatsApp dos clientes e atendentes conectado.
3. **NUNCA exclua volumes Docker de banco de dados:**
   - O volume `gp-garantia-test-pgdata` armazena todos os dados de mensagens, contatos, anúncios e configurações.

---

## 1. 🖥️ INFRAESTRUTURA & TOPOLOGIA DO SERVIDOR

- **IP da VPS:** `2.24.212.146`
- **Domínio Principal:** `crm.nailacademyprofissional.com`
- **Acesso SSH:** `ssh -i ~/.ssh/vps_gppremium root@2.24.212.146`
- **Sistema Operacional:** Ubuntu 22.04 LTS

### 🌐 Mapeamento de Portas e Serviços:
| Serviço | Porta Interna | Porta Externa / Pública | Descrição |
| :--- | :--- | :--- | :--- |
| **Nginx Web Server** | 80 / 443 | 80 / 443 (SSL) | Reverse Proxy para o CRM e APIs |
| **Backend Node.js (PM2)** | 3001 | Interna (Proxy Nginx) | API Express + Prisma + Baileys Engine |
| **PostgreSQL 16 (Docker)** | 5432 | `0.0.0.0:5432` | Banco de Dados Principal da VPS (Acesso pgAdmin) |

---

## 2. 🗄️ BANCO DE DADOS LOCAL (POSTGRESQL 16 & PGADMIN)

O CRM não depende de serviços externos de nuvem (desacoplado do Supabase). Ele utiliza um container dedicado PostgreSQL 16 com persistência em disco SSD local.

### 🔑 Credenciais para pgAdmin / DBeaver / Conexão Externa:
- **Host / IP:** `2.24.212.146`
- **Porta:** `5432`
- **Database:** `testdb`
- **Username:** `postgres`
- **Password:** `hM8ulbWecWeIp48Go2Rk7`
- **String de Conexão Interna:** `postgresql://postgres:hM8ulbWecWeIp48Go2Rk7@127.0.0.1:5432/testdb?schema=public`

### 📦 Principais Tabelas do Prisma (`prisma/schema.prisma`):
1. **`Usuario`**: Atendentes, mecânicos, gerentes e administradores (`role`: admin, operador, gerente).
2. **`Loja`**: Lojas físicas da rede (City Pneus, Feirão, Super Via, Direcional, GP Premium).
3. **`Mensagem`**: Histórico completo de conversas (texto, fotos, áudios, protocolo, `fromMe`, `enviadoPorId`).
4. **`Contato`**: Base de clientes, lead score, etiquetas e números normalizados.
5. **`Agendamento`**: Visitas e serviços agendados para montagem/instalação de pneus.
6. **`OlxAnuncio`**: Gestão completa de anúncios OLX integrados com webhook e status.
7. **`BotConversa`**: Estado do robô de IA por contato, pausa manual e motivo de transferência.

---

## 3. 🤖 MOTOR DE IA & REGRAS COMERCIAIS (BOT PNEUS)

- **Arquivo Principal:** `backend/src/workers/botAtendimentoService.ts`
- **Módulo de Preços:** `backend/src/data/tabelaPrecos.ts`
- **Persona:** `Josi - Vendedora Consultiva Especialista GP Premium`
- **Temperatura da IA:** `0.35` (foco em conversão e precisão cirúrgica de valores).

### 🏷️ Regras Comerciais Oficiais (Tabela TAB. 7):
1. **Pneus em PROMOÇÃO:**
   - `165/70 R13` (R$ 239,00 à vista / 10x R$ 26,82)
   - `165/70 R14` (R$ 239,00 à vista / 10x R$ 26,82)
   - `175/70 R13` (R$ 239,00 à vista / 10x R$ 26,82)
   - `175/65 R14` (R$ 269,00 à vista / 10x R$ 30,13)
   - `175/70 R14` (R$ 249,00 à vista / 10x R$ 27,94)
   - `185/60 R14` (R$ 279,00 à vista / 10x R$ 31,31)
   - `185/60 R15` (R$ 249,00 à vista / 10x R$ 27,94)
   - `185/65 R15` (R$ 249,00 à vista / 10x R$ 27,94)
   - `195/55 R16` (R$ 259,00 à vista / 10x R$ 29,05)
2. **Campanha COMPRE 3 E LEVE 4:**
   - Medidas participantes: `195/65 R15` (R$ 328,90 à vista) e `225/45 R17` (R$ 339,00 à vista).
   - Para compra de 1 ou 2 pneus desses itens: conceder **até 10% de desconto**.
3. **Desconto de 5% à Vista:**
   - Concedido para pagamento via **PIX ou Dinheiro** ou como argumento de fechamento imediato.
4. **Garantia de 50.000 KM:**
   - Montagem, balanceamento e alinhamento cortesia na instalação nas lojas parceiras.
5. **Agendamento Automático via IA:**
   - A IA emite a tag `[AGENDAR_VISITA: data="YYYY-MM-DD HH:mm", loja="...", servico="...", cliente="..."]` e o backend grava direto no PostgreSQL.
6. **Transbordo Humano Inteligente:**
   - Tag `[TRANSFERIR_HUMANO]` pausa a IA por 120 minutos e notifica os atendentes. Qualquer mensagem enviada manualmente por um vendedor também pausa o robô por 120 minutos automaticamente.

---

## 4. 💻 FRONTEND & INTERFACE (REACT + VITE)

- **Código Fonte:** `/root/crm-de-anuncios/`
- **Destino do Build de Produção:** `/root/whatsapp-crm/backend/public/anuncios/`
- **Padrão Visual:** **GP Navy Dark Premium**
  - Fundo principal: `#0b101e`
  - Painéis / Cards: `#10192e` com bordas `rgba(255,255,255,0.08)`
  - Destaque e Ações: **GP Red `#E8252C`**
  - Mensagens do Cliente: `#1e293b` com texto `#ffffff` (alto contraste)
  - Mensagens da Loja: `#1d4ed8` com texto `#ffffff`

---

## 5. 🛠️ GUIA DE COMANDOS SEGUROS PARA MANUTENÇÃO

### 🔄 Como compilar e publicar alterações no Frontend:
```bash
cd /root/crm-de-anuncios
npm run build
cp -r dist/* /root/whatsapp-crm/backend/public/anuncios/
```

### 🔄 Como aplicar alterações no Backend sem derrubar o WhatsApp:
```bash
cd /root/whatsapp-crm/backend
PORT=3001 pm2 reload whatsapp-crm --update-env
```

### 💾 Como fazer backup completo do Banco de Dados:
```bash
docker exec gp-postgres-crm pg_dump -U postgres -d testdb > /root/backup_$(date +%Y%m%d_%H%M%S).sql
```

### 🔍 Como verificar logs do sistema em tempo real:
```bash
pm2 logs whatsapp-crm --lines 50
```
