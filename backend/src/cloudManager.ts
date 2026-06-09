import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const CONFIG_PATH = path.join(__dirname, '..', 'config_nuvem.json');

export interface CloudConfigs {
  planoA: string;
  planoB: string;
  planoC: string;
}

class CloudManager {
  private configs: CloudConfigs = { planoA: '', planoB: '', planoC: '' };
  private planoAtivo: 'A' | 'B' | 'C' | null = null;
  private prismaInstance: PrismaClient | null = null;
  // Trava: garante que só UMA verificação de failover rode por vez (evita boot duplo
  // competindo por conexões com o banco free e derrubando a conexão).
  private initializingPromise: Promise<{ ativo: 'A'|'B'|'C'|null, prisma: PrismaClient|null }> | null = null;

  async loadConfigs(): Promise<CloudConfigs> {
    try {
      const data = await fs.readFile(CONFIG_PATH, 'utf-8');
      this.configs = JSON.parse(data);
    } catch (err) {
      // Arquivo não existe ou inválido, retorna vazio
      this.configs = { planoA: '', planoB: '', planoC: '' };
    }
    return this.configs;
  }

  async saveConfigs(novasConfigs: CloudConfigs): Promise<void> {
    this.configs = {
      planoA: novasConfigs.planoA || '',
      planoB: novasConfigs.planoB || '',
      planoC: novasConfigs.planoC || ''
    };
    await fs.writeFile(CONFIG_PATH, JSON.stringify(this.configs, null, 2), 'utf-8');
  }

  // Testa uma URL usando o próprio Prisma de forma efêmera.
  // Tenta VÁRIAS vezes, porque o Supabase free às vezes recusa a 1ª conexão
  // (limite de conexões / "acordando"). Sem o retry, o failover caía em banco vazio.
  private async testConnection(url: string): Promise<boolean> {
    if (!url || !url.startsWith('postgres')) return false;

    const MAX_TENTATIVAS = 5;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      const tester = new PrismaClient({
        datasources: { db: { url } }
      });
      try {
        // Timeout de 25s por tentativa: tolera o banco responder devagar ao "acordar".
        await Promise.race([
          tester.$connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 25000))
        ]);
        await tester.$disconnect();
        return true;
      } catch (e) {
        console.log(`[CloudManager] Falha ao testar URL (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url.split('@')[1] || 'URL Inválida'}`);
        try { await tester.$disconnect(); } catch (e) {}
        // Espera antes de tentar de novo (dá tempo do Supabase liberar conexão)
        if (tentativa < MAX_TENTATIVAS) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
    return false;
  }

  // Descobre qual plano está online e atualiza o PrismaClient oficial.
  // Protegido por trava para nunca rodar duas vezes em paralelo.
  async initializeFailover(): Promise<{ ativo: 'A'|'B'|'C'|null, prisma: PrismaClient|null }> {
    if (this.initializingPromise) {
      // Já há uma verificação em andamento — reaproveita (evita boot duplo).
      return this.initializingPromise;
    }
    this.initializingPromise = this._doInitializeFailover();
    try {
      return await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }

  private async _doInitializeFailover(): Promise<{ ativo: 'A'|'B'|'C'|null, prisma: PrismaClient|null }> {
    await this.loadConfigs();

    console.log('[CloudManager] Iniciando verificação de nuvens...');

    let novoPlano: 'A' | 'B' | 'C' | null = null;
    if (this.configs.planoA && await this.testConnection(this.configs.planoA)) {
      novoPlano = 'A';
    } else if (this.configs.planoB && await this.testConnection(this.configs.planoB)) {
      novoPlano = 'B';
    } else if (this.configs.planoC && await this.testConnection(this.configs.planoC)) {
      novoPlano = 'C';
    }

    // Nenhuma URL conectou agora.
    if (!novoPlano) {
      // Se já temos uma conexão ativa funcionando, MANTEMOS ela — não derruba o banco
      // por uma falha intermitente de teste (Supabase free às vezes recusa um teste).
      if (this.prismaInstance && this.planoAtivo) {
        console.warn(`[CloudManager] Teste falhou agora, mas mantendo a conexão ativa existente (Plano ${this.planoAtivo}).`);
        return { ativo: this.planoAtivo, prisma: this.prismaInstance };
      }
      console.warn('[CloudManager] ALERTA CRÍTICO: Nenhum banco de dados na nuvem está online ou configurado.');
      this.prismaInstance = null;
      this.planoAtivo = null;
      return { ativo: null, prisma: null };
    }

    let activeUrl = '';
    if (novoPlano === 'A') activeUrl = this.configs.planoA;
    if (novoPlano === 'B') activeUrl = this.configs.planoB;
    if (novoPlano === 'C') activeUrl = this.configs.planoC;

    console.log(`[CloudManager] Conectado com sucesso ao Plano ${novoPlano}!`);

    // SEGURANÇA: sem `--accept-data-loss` — só mudanças aditivas seguras.
    try {
      console.log('[CloudManager] Sincronizando tabelas do Prisma com a nuvem (modo seguro)...');
      const { execSync } = require('child_process');
      execSync('npx prisma db push --skip-generate', {
        env: { ...process.env, DATABASE_URL: activeUrl },
        stdio: 'inherit'
      });
      console.log('[CloudManager] Tabelas sincronizadas com sucesso!');
    } catch (e) {
      console.error('[CloudManager] Aviso ao sincronizar Prisma (mantendo banco como está):', e);
    }

    // Cria a nova instância e SÓ ENTÃO desconecta a antiga (nunca fica sem banco no meio).
    const novaInstancia = new PrismaClient({ datasources: { db: { url: activeUrl } } });
    await novaInstancia.$connect();
    const antiga = this.prismaInstance;
    this.prismaInstance = novaInstancia;
    this.planoAtivo = novoPlano;
    if (antiga) {
      antiga.$disconnect().catch(() => {});
    }
    return { ativo: novoPlano, prisma: novaInstancia };
  }

  getPrisma(): PrismaClient {
    if (!this.prismaInstance) {
      throw new Error('Banco de dados não configurado. Acesse o Painel Admin.');
    }
    return this.prismaInstance;
  }
  
  getAtivo() {
    return this.planoAtivo;
  }
  
  getConfigs() {
    return this.configs;
  }
}

export const cloudManager = new CloudManager();
