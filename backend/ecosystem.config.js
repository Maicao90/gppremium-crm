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
        PORT: 443
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
    }
  ]
};
