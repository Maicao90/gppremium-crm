module.exports = {
  apps: [
    {
      name: 'whatsapp-crm',
      script: 'src/server.ts',
      interpreter: 'ts-node',
      interpreter_args: '--project tsconfig.json',
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
