import fs from 'fs';
import path from 'path';

// ===== E-mail do app de Garantia (cliente final) =====
// nodemailer com SMTP vindo do .env:
//   GARANTIA_SMTP_HOST, GARANTIA_SMTP_PORT (465 = SSL; outro = STARTTLS), GARANTIA_SMTP_USER,
//   GARANTIA_SMTP_PASS, GARANTIA_EMAIL_FROM ("GP Premium <naoresponda@pneusgppremium.com.br>").
// Sem GARANTIA_SMTP_HOST → não envia (loga 1x) e nada quebra. Só LABORATÓRIO:
// GARANTIA_SMTP_HOST=json → não sai e-mail nenhum; grava o HTML em GARANTIA_EMAIL_DUMP (pasta).
// require (não import) pra não depender de @types/nodemailer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer');

const LOGO_URL = process.env.GARANTIA_EMAIL_LOGO || 'https://link.pneusgppremium.com.br/logo-pneus-gp-premium.png';
const VERMELHO = '#E31B23';
const AZUL = '#1E2A6B';
const CINZA_TEXTO = '#2b2f3a';
const CINZA_FRACO = '#6b7186';
// Lojas do app (mesmo app pra cliente e mecânico).
export const LINK_APP_IOS = process.env.GARANTIA_LINK_IOS || 'https://apps.apple.com/br/app/id6819748178';
export const LINK_APP_ANDROID = process.env.GARANTIA_LINK_ANDROID || 'https://play.google.com/store/apps/details?id=com.gppremium.garantia';
// Selos oficiais (Apple/Google, pt-BR) em PNG no nosso servidor — Gmail não mostra SVG.
const SELO_APP_STORE = 'https://link.pneusgppremium.com.br/selo-app-store.png';
const SELO_GOOGLE_PLAY = 'https://link.pneusgppremium.com.br/selo-google-play.png';

let transporte: any = null;
let avisouSemConfig = false;

export function emailConfigurado(): boolean {
  return Boolean(String(process.env.GARANTIA_SMTP_HOST || '').trim());
}

function getTransporte(): any {
  if (transporte) return transporte;
  const host = String(process.env.GARANTIA_SMTP_HOST || '').trim();
  if (!host) return null;
  if (host === 'json') {
    transporte = nodemailer.createTransport({ jsonTransport: true });
  } else {
    const port = Number(process.env.GARANTIA_SMTP_PORT) || 587;
    transporte = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: process.env.GARANTIA_SMTP_USER ? { user: process.env.GARANTIA_SMTP_USER, pass: process.env.GARANTIA_SMTP_PASS || '' } : undefined,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    });
  }
  return transporte;
}

const esc = (s: string) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type ConteudoEmail = {
  titulo: string;
  texto: string;
  destaque?: string;                          // ex.: código de 6 dígitos
  info?: [string, string][];                  // quadro "Placa | ABC1D23", "Cobertura | até 90.000 km"
  fotos?: { url: string; rotulo?: string }[]; // fotos (vistoria) — miniaturas clicáveis
  botao?: { texto: string; url: string };
  rodapeExtra?: string;
};

// Botão "à prova de cliente de e-mail" (tabela + link), funciona no Gmail/Outlook/iPhone.
const botaoHtml = (texto: string, url: string, cor = AZUL) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:10px;background:${cor};">`
  + `<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(texto)}</a>`
  + `</td></tr></table>`;

function infoHtml(linhas: [string, string][]): string {
  const tr = linhas.filter(([, v]) => String(v || '').trim()).map(([k, v], i) =>
    `<tr><td style="padding:10px 14px;font-size:13px;color:${CINZA_FRACO};${i ? 'border-top:1px solid #e6e8f0;' : ''}width:34%;">${esc(k)}</td>`
    + `<td style="padding:10px 14px;font-size:15px;font-weight:700;color:${AZUL};${i ? 'border-top:1px solid #e6e8f0;' : ''}">${esc(v)}</td></tr>`).join('');
  return tr ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;background:#f5f6fb;border-radius:12px;border:1px solid #e6e8f0;">${tr}</table>` : '';
}

// Grade 2 por linha (fica boa no celular e no computador). Até 8 fotos; a foto abre grande.
function fotosHtml(fotos: { url: string; rotulo?: string }[]): string {
  const lista = fotos.filter((f) => /^https?:\/\//.test(f.url)).slice(0, 8);
  if (!lista.length) return '';
  let linhas = '';
  for (let i = 0; i < lista.length; i += 2) {
    const cel = (f?: { url: string; rotulo?: string }) => f
      ? `<td width="50%" style="padding:5px;vertical-align:top;"><a href="${esc(f.url)}" target="_blank" style="text-decoration:none;">`
        + `<img src="${esc(f.url)}" alt="${esc(f.rotulo || 'Foto')}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border-radius:10px;border:0;background:#e6e8f0;">`
        + (f.rotulo ? `<span style="display:block;padding:5px 2px 0;font-size:12px;color:${CINZA_FRACO};">${esc(f.rotulo)}</span>` : '')
        + `</a></td>`
      : '<td width="50%" style="padding:5px;"></td>';
    linhas += `<tr>${cel(lista[i])}${cel(lista[i + 1])}</tr>`;
  }
  return `<p style="margin:4px 0 8px;font-size:14px;font-weight:700;color:${AZUL};">Fotos de como o carro chegou</p>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${linhas}</table>`;
}

const appHtml = () => `
<tr><td style="padding:4px 28px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fb;border-radius:14px;border:1px solid #e6e8f0;">
<tr><td style="padding:18px 18px 6px;text-align:center;">
<p style="margin:0 0 4px;font-size:16px;font-weight:800;color:${AZUL};">Baixe o app GP Premium</p>
<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${CINZA_FRACO};">Acompanhe sua garantia de 60 mil km, as revisões e as fotos do seu carro na oficina.</p>
</td></tr>
<tr><td style="padding:0 12px 18px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding:4px;"><a href="${esc(LINK_APP_IOS)}" target="_blank" style="text-decoration:none;"><img src="${esc(SELO_APP_STORE)}" alt="Baixar na App Store" width="120" height="40" style="display:block;width:120px;height:40px;border:0;"></a></td>
<td style="padding:4px;"><a href="${esc(LINK_APP_ANDROID)}" target="_blank" style="text-decoration:none;"><img src="${esc(SELO_GOOGLE_PLAY)}" alt="Disponível no Google Play" width="135" height="40" style="display:block;width:135px;height:40px;border:0;"></a></td>
</tr></table>
</td></tr>
</table>
</td></tr>`;

// Layout único: logo oficial, faixa vermelho/azul, título, texto, quadro de informações,
// código em destaque, fotos, botão, bloco "baixe o app" e rodapé.
export function montarHtml(p: ConteudoEmail): string {
  const paragrafos = String(p.texto || '').split(/\n{2,}/).map((par) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${CINZA_TEXTO};">${esc(par).replace(/\n/g, '<br>')}</p>`).join('');
  const destaque = p.destaque
    ? `<div style="margin:8px 0 20px;padding:18px;border-radius:12px;background:#f3f4fa;border:2px dashed ${AZUL};text-align:center;font-size:36px;letter-spacing:12px;font-weight:800;color:${AZUL};font-family:Consolas,Menlo,monospace;">${esc(p.destaque)}</div>`
    : '';
  const previa = esc(String(p.texto || '').replace(/\s+/g, ' ').slice(0, 120));
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(p.titulo)}</title></head>
<body style="margin:0;padding:0;background:#eef0f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previa}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 18px rgba(20,24,60,.10);">
<tr><td align="center" style="padding:26px 24px 18px;"><img src="${esc(LOGO_URL)}" alt="Pneus GP Premium" width="260" style="display:block;width:260px;max-width:80%;height:auto;border:0;"></td></tr>
<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="height:5px;background:${VERMELHO};width:50%;font-size:0;line-height:0;">&nbsp;</td>
<td style="height:5px;background:${AZUL};width:50%;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:30px 28px 8px;">
<h1 style="margin:0 0 16px;font-size:23px;line-height:1.3;color:${AZUL};">${esc(p.titulo)}</h1>
${paragrafos}${destaque}${p.info ? infoHtml(p.info) : ''}${p.fotos ? fotosHtml(p.fotos) : ''}
${p.botao ? `<div style="margin:6px 0 22px;">${botaoHtml(p.botao.texto, p.botao.url)}</div>` : ''}
${p.rodapeExtra ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#8b90a3;">${esc(p.rodapeExtra)}</p>` : ''}
</td></tr>
${appHtml()}
<tr><td style="background:${AZUL};padding:16px 28px;text-align:center;font-size:12px;line-height:1.6;color:#c9cce0;">
<b style="color:#ffffff;">Pneus GP Premium</b> · Garantia 60 mil km ou 2 anos<br>Este é um e-mail automático, não precisa responder.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// Envia (ou grava, no lab). Nunca lança: falha só loga. Devolve true se entregou ao SMTP.
export async function enviarEmailGarantia(p: ConteudoEmail & { para: string; assunto: string }): Promise<boolean> {
  const para = String(p.para || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return false;
  const t = getTransporte();
  if (!t) {
    if (!avisouSemConfig) { avisouSemConfig = true; console.log('[garantiaEmail] GARANTIA_SMTP_HOST não configurado — e-mails da garantia desligados.'); }
    return false;
  }
  try {
    const html = montarHtml(p);
    const info = (p.info || []).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
    const textoPuro = `${p.titulo}\n\n${p.texto}${p.destaque ? `\n\n${p.destaque}` : ''}${info ? `\n\n${info}` : ''}`
      + `${p.botao ? `\n\n${p.botao.texto}: ${p.botao.url}` : ''}\n\nBaixe o app GP Premium:\niPhone: ${LINK_APP_IOS}\nAndroid: ${LINK_APP_ANDROID}\n\n— GP Premium`;
    const resp = await t.sendMail({
      from: process.env.GARANTIA_EMAIL_FROM || 'GP Premium <naoresponda@pneusgppremium.com.br>',
      to: para, subject: p.assunto, html, text: textoPuro,
    });
    if (process.env.GARANTIA_SMTP_HOST === 'json') {
      const dir = process.env.GARANTIA_EMAIL_DUMP;
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
        const base = `${Date.now()}-${para.replace(/[^a-z0-9@._-]/gi, '_')}`;
        fs.writeFileSync(path.join(dir, base + '.html'), html);
        fs.writeFileSync(path.join(dir, base + '.txt'), `Para: ${para}\nAssunto: ${p.assunto}\n\n${textoPuro}\n`);
      }
      console.log(`[garantiaEmail] (json/lab) para=${para} assunto="${p.assunto}"`);
    } else {
      console.log(`[garantiaEmail] enviado para ${para.replace(/^(.{2}).*(@.*)$/, '$1***$2')}: ${resp?.messageId || ''}`);
    }
    return true;
  } catch (e: any) {
    console.error('[garantiaEmail] falha ao enviar:', e?.message);
    return false;
  }
}
