# Garantia 50k — App Mobile (protótipo)

App do cliente/mecânico da **Garantia 50.000 KM** (Expo / React Native), trazido do
repositório original `GPPREMIUMGARANTIA50K` para morar junto do CRM.

## ⚠️ Estado atual: PROTÓTIPO VISUAL

Este app ainda **não está conectado** ao CRM. Ele foi construído como demonstração:

- O login é fake (roteia pelo e-mail digitado: `mecanico@gmail.com` → tela do mecânico,
  `admin@gmail.com` → admin, qualquer outro → cliente). Não valida senha.
- Os dados vêm de um arquivo JSON local (`/api/database` de um servidor Next.js que não
  existe mais) ou são fixos no código — nada é lido/gravado no banco do CRM.
- As "fotos" dos formulários são placeholders de texto (não abrem a câmera).
- Cadastro de cliente não grava em lugar nenhum.

## O que JÁ foi portado pro CRM (e vale de verdade)

A parte administrativa/web deste sistema virou o módulo **Garantia 50k** do painel
(`crm-de-anuncios` → aba Aplicativos), com banco PostgreSQL e login reais:

- Ativação de garantia (cliente por CPF + veículo + pneus + fotos) → `backend/src/routes/garantia.ts`
- Auditoria (aprovar/reprovar), revisões com sulcos por pneu, alertas automáticos de
  DOT divergente e sulco abaixo de 1.6mm
- Sorteio criptográfico (Fisher-Yates + crypto) entre garantias ativas

## Próximo passo (quando for a hora de ter o app de verdade)

1. Trocar as chamadas a `http://localhost:3000/api/database` por `https://crm.nailacademyprofissional.com/api/garantia/...`
2. Login real contra `/api/auth/login` do CRM (JWT) + um papel "cliente"
3. Câmera de verdade (`expo-camera`/`expo-image-picker`) nos formulários de foto

## Rodar o protótipo localmente

```bash
npm install
npx expo start
```
