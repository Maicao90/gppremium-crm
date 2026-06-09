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

  // Descobre qual plano está online e atualiza o PrismaClient oficial
  async initializeFailover(): Promise<{ ativo: 'A'|'B'|'C'|null, prisma: PrismaClient|null }> {
    await this.loadConfigs();
    
    console.log('[CloudManager] Iniciando verificação de nuvens...');
    
    if (this.configs.planoA && await this.testConnection(this.configs.planoA)) {
      this.planoAtivo = 'A';
    } else if (this.configs.planoB && await this.testConnection(this.configs.planoB)) {
      this.planoAtivo = 'B';
    } else if (this.configs.planoC && await this.testConnection(this.configs.planoC)) {
      this.planoAtivo = 'C';
    } else {
      this.planoAtivo = null;
    }

    if (this.prismaInstance) {
      await this.prismaInstance.$disconnect();
    }

    if (this.planoAtivo) {
      let activeUrl = '';
      if (this.planoAtivo === 'A') activeUrl = this.configs.planoA;
      if (this.planoAtivo === 'B') activeUrl = this.configs.planoB;
      if (this.planoAtivo === 'C') activeUrl = this.configs.planoC;
      
      console.log(`[CloudManager] Conectado com sucesso ao Plano ${this.planoAtivo}!`);
      
      // SEGURANÇA: NÃO usamos mais `--accept-data-loss` (ele podia APAGAR dados se o
      // esquema divergisse). Sem a flag, o db push só faz mudanças aditivas seguras;
      // se exigiria perda de dados, ele falha e mantemos o banco como está.
      try {
        console.log('[CloudManager] Sincronizando tabelas do Prisma com a nuvem (modo seguro, sem perda de dados)...');
        const { execSync } = require('child_process');
        execSync('npx prisma db push --skip-generate', {
          env: { ...process.env, DATABASE_URL: activeUrl },
          stdio: 'inherit'
        });
        console.log('[CloudManager] Tabelas da nuvem sincronizadas com sucesso!');
      } catch (e) {
        console.error('[CloudManager] Aviso ao sincronizar Prisma (mantendo banco como está):', e);
      }

      this.prismaInstance = new PrismaClient({
        datasources: { db: { url: activeUrl } }
      });
      // Importante: garante que a conexão inicie
      await this.prismaInstance.$connect();
      return { ativo: this.planoAtivo, prisma: this.prismaInstance };
    } else {
      console.warn('[CloudManager] ALERTA CRÍTICO: Nenhum banco de dados na nuvem está online ou configurado.');
      this.prismaInstance = null;
      return { ativo: null, prisma: null };
    }
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
