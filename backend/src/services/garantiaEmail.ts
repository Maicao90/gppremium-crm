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

const LOGO_URL = process.env.GARANTIA_EMAIL_LOGO || 'https://link.pneusgppremium.com.br/logo-gp.jpg';
const VERMELHO = '#E31B23';
const AZUL = '#27286E';

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

// Layout único dos e-mails: logo oficial no topo, faixa vermelho/azul da marca, título,
// texto (quebras de linha viram parágrafos) e um "destaque" opcional (ex.: código).
export function montarHtml(p: { titulo: string; texto: string; destaque?: string; rodapeExtra?: string }): string {
  const paragrafos = String(p.texto || '').split(/\n{2,}/).map((par) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#2b2f3a;">${esc(par).replace(/\n/g, '<br>')}</p>`).join('');
  const destaque = p.destaque
    ? `<div style="margin:8px 0 18px;padding:18px;border-radius:12px;background:#f3f4fa;text-align:center;font-size:34px;letter-spacing:10px;font-weight:700;color:${AZUL};font-family:Consolas,Menlo,monospace;">${esc(p.destaque)}</div>`
    : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.titulo)}</title></head>
<body style="margin:0;padding:0;background:#eef0f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(20,24,60,.08);">
<tr><td align="center" style="padding:22px 24px 14px;"><img src="${esc(LOGO_URL)}" alt="GP Premium" width="150" style="display:block;width:150px;max-width:60%;height:auto;border:0;"></td></tr>
<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="height:5px;background:${VERMELHO};width:50%;font-size:0;line-height:0;">&nbsp;</td>
<td style="height:5px;background:${AZUL};width:50%;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:28px 28px 10px;">
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${AZUL};">${esc(p.titulo)}</h1>
${paragrafos}${destaque}
</td></tr>
<tr><td style="padding:6px 28px 26px;">
<p style="margin:0;font-size:14px;line-height:1.5;color:#6b7186;">Acompanhe sua garantia, revisões e vistorias no app <b style="color:${AZUL};">Pneus GP Premium</b>.</p>
${p.rodapeExtra ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#8b90a3;">${esc(p.rodapeExtra)}</p>` : ''}
</td></tr>
<tr><td style="background:${AZUL};padding:14px 28px;text-align:center;font-size:12px;color:#c9cce0;">GP Premium Pneus · Este é um e-mail automático, não responda.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// Envia (ou grava, no lab). Nunca lança: falha só loga. Devolve true se entregou ao SMTP.
export async function enviarEmailGarantia(p: { para: string; assunto: string; titulo: string; texto: string; destaque?: string; rodapeExtra?: string }): Promise<boolean> {
  const para = String(p.para || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return false;
  const t = getTransporte();
  if (!t) {
    if (!avisouSemConfig) { avisouSemConfig = true; console.log('[garantiaEmail] GARANTIA_SMTP_HOST não configurado — e-mails da garantia desligados.'); }
    return false;
  }
  try {
    const html = montarHtml(p);
    const textoPuro = `${p.titulo}\n\n${p.texto}${p.destaque ? `\n\n${p.destaque}` : ''}\n\n— GP Premium`;
    const info = await t.sendMail({
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
      console.log(`[garantiaEmail] enviado para ${para.replace(/^(.{2}).*(@.*)$/, '$1***$2')}: ${info?.messageId || ''}`);
    }
    return true;
  } catch (e: any) {
    console.error('[garantiaEmail] falha ao enviar:', e?.message);
    return false;
  }
}
