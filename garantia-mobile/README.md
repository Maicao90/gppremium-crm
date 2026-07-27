# Garantia 50k — App Mobile (GP Premium)

App Expo/React Native **amarrado ao backend real** do CRM
(`https://crm.nailacademyprofissional.com`). Um app só, com duas caras conforme o login:

- **Loja (mecânico)** — entra com o **mesmo login do CRM**. Cadastra garantia e faz
  revisão, com **câmera de verdade**. Só loja **credenciada** consegue cadastrar/revisar.
- **Cliente** — entra com **CPF + senha** (cria no cadastro). Vê as garantias e revisões
  dele, recebe **push** de lembrete de revisão e acha as oficinas autorizadas.

O painel **admin** NÃO está no app — é o painel web do CRM (aba Garantia 50k).

## Rodar (primeira vez)

```bash
cd garantia-mobile
npm install
# alinha as libs nativas à versão exata do SDK do Expo instalado:
npx expo install expo-image-picker expo-notifications expo-device expo-secure-store
npx expo start
```

Abra no **Expo Go** (celular) ou pressione `a`/`i` pra emulador. Push e câmera só
funcionam em **aparelho de verdade** (não no simulador nem no web).

## O que está amarrado (funciona de ponta a ponta)

| Tela | Backend |
|---|---|
| Login loja | `POST /api/usuarios/login` |
| Login/Cadastro cliente | `POST /api/garantia-app/cliente/{login,registrar}` |
| Mecânico: home (KPIs) | `GET /api/garantia/resumo` |
| Mecânico: **Ativar Garantia** (fotos reais) | `GET /clientes/busca`, `POST /api/garantia/garantias` |
| Mecânico: **Nova Revisão** (fotos reais) | `GET /garantias/por-placa`, `POST /api/garantia/revisoes` |
| Cliente: home (garantias + revisões) | `GET /api/garantia-app/cliente/me` |
| Cliente: notificações | `GET /cliente/me`, `POST /cliente/notificacoes/:id/lida` |
| Cliente: oficinas | `GET /api/garantia-app/oficinas` |
| Push token | `POST /api/garantia-app/cliente/push-token` (worker `garantiaPush` dispara) |

Estrutura: `src/lib/` (api, auth, foto, push) · `src/components/FotoBotao.tsx` ·
`src/app/` (rotas expo-router).

## Ainda por fazer (próximas iterações)

- Testar tudo em aparelho real (câmera + push) — precisa ser feito por você.
- Telas extras do cliente (promoções, sorteios, suporte) — removidas por enquanto (eram
  protótipo estático); dá pra trazer de volta amarradas quando quiser.
- Build de produção (EAS) e publicação nas lojas.
