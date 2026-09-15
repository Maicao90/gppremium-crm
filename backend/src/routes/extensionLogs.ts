import { Router } from 'express';

const router = Router();

// Recebe logs de diagnostico da extensao (boot, crash global, eventos de RPA antigo, etc).
// Achado 15/09: a extensao SEMPRE tentou mandar log pra cá (logExtension/relator de crash
// em content.tsx ja chamavam este endpoint), mas a rota nunca existiu no backend — todo
// log caia no vazio (fetch falhava em silencio), entao nunca sobrou rastro de nada que a
// extensao reportava. Sem auth de proposito: o relator de crash dispara ANTES do login
// (assim que o content script carrega), entao nao pode depender de token.
//
// So escreve no log do processo (pm2 captura) — sem tabela nova no banco, pra manter esta
// correcao pequena e de baixo risco. Se algum dia isto virar volume alto e precisar de
// consulta estruturada, ai sim vale criar uma tabela.
router.post('/', (req, res) => {
  try {
    const { nivel, escopo, mensagem, erro, versao } = req.body || {};
    const nivelSeguro = ['info', 'warn', 'error'].includes(nivel) ? nivel : 'info';
    const prefixo = `[EXT-LOG][${String(escopo || 'sem-escopo')}]${versao ? '[v' + versao + ']' : ''}`;
    const linha = `${prefixo} ${String(mensagem || '')}`;
    if (nivelSeguro === 'error') {
      console.error(linha, erro || '');
    } else if (nivelSeguro === 'warn') {
      console.warn(linha);
    } else {
      console.log(linha);
    }
  } catch (e) {
    console.error('[EXT-LOG] Erro ao processar log da extensao:', e);
  }
  // Sempre 200 — nunca quero que uma falha aqui vire retry/loop no lado da extensao.
  res.status(200).json({ ok: true });
});

export default router;
