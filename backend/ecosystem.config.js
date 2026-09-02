module.exports = {
  apps: [
    {
      name: 'whatsapp-crm',
      script: 'src/server.ts',
      interpreter: 'ts-node',
      // --prefer-ts-exts: faz o ts-node usar os arquivos .ts (fonte verdadeira) e IGNORAR
      // quaisquer .js compilados antigos que estejam "escondendo" os .ts no src/.
      interpreter_args: '--prefer-ts-exts --project tsconfig.json',
      cwd: '/root/whatsapp-crm/backend',
      env: {
        NODE_ENV: 'production',
        // Porta INTERNA (localhost). O Nginx fica exposto em 443/80 e faz proxy pra cá.
        // NÃO usar 443 aqui (colide com o Nginx -> EADDRINUSE). Fixado em 3001 (06/07/2026).
        PORT: 3001
      },
      // Auto-reinicia se o processo cair
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // Logs
      out_file: '/root/whatsapp-crm/logs/app.log',
      error_file: '/root/whatsapp-crm/logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Reinicia até 10 vezes em caso de falha
      max_restarts: 10,
      restart_delay: 3000
    },
    {
      // Servico ISOLADO do robo (so decide o TEXTO da resposta). Roda separado de
      // proposito: reload/crash aqui NUNCA afeta as conexoes de WhatsApp dos atendentes
      // (achado e corrigido em 25-26/08/2026 — antes, qualquer ajuste de bot derrubava
      // TODO MUNDO porque era o mesmo processo).
      name: 'bot-service',
      script: 'src/bot-service/server.ts',
      interpreter: 'ts-node',
      interpreter_args: '--prefer-ts-exts --project tsconfig.json',
      cwd: '/root/whatsapp-crm/backend',
      env: {
        NODE_ENV: 'production',
        BOT_SERVICE_PORT: 3010
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      out_file: '/root/whatsapp-crm/logs/bot-service.log',
      error_file: '/root/whatsapp-crm/logs/bot-service-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_restarts: 10,
      restart_delay: 3000
    }
  ]
};
