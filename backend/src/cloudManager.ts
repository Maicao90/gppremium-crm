import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const CONFIG_PATH = path.join(__dirname, '..', 'config_nuvem.json');
const DEFAULT_DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:hM8ulbWecWeIp48Go2Rk7@127.0.0.1:5432/testdb?schema=public';

export interface CloudConfigs {
  planoA: string;
  planoB: string;
  planoC: string;
}

class CloudManager {
  private configs: CloudConfigs = { planoA: DEFAULT_DB_URL, planoB: '', planoC: '' };
  private planoAtivo: 'A' | 'B' | 'C' | null = 'A';
  private prismaInstance: PrismaClient | null = new PrismaClient({ datasources: { db: { url: DEFAULT_DB_URL } } });
  private initializingPromise: Promise<{ ativo: 'A'|'B'|'C'|null, prisma: PrismaClient|null }> | null = null;

  constructor() {
    this.loadConfigs().catch(() => {});
  }

  async loadConfigs(): Promise<CloudConfigs> {
    try {
      const data = await fs.readFile(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      this.configs = {
        planoA: parsed.planoA || DEFAULT_DB_URL,
        planoB: parsed.planoB || '',
        planoC: parsed.planoC || '',
      };
    } catch (err) {
      this.configs = { planoA: DEFAULT_DB_URL, planoB: '', planoC: '' };
    }
    return this.configs;
  }

  async saveConfigs(novasConfigs: CloudConfigs): Promise<void> {
    this.configs = {
      planoA: novasConfigs.planoA || DEFAULT_DB_URL,
      planoB: novasConfigs.planoB || '',
      planoC: novasConfigs.planoC || ''
    };
    await fs.writeFile(CONFIG_PATH, JSON.stringify(this.configs, null, 2), 'utf-8');
  }

  private async testConnection(url: string): Promise<boolean> {
    if (!url || !url.startsWith('postgres')) return false;

    const MAX_TENTATIVAS = 3;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      const tester = new PrismaClient({ datasources: { db: { url } } });
      try {
        await Promise.race([
          tester.$connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        await tester.$disconnect();
        return true;
      } catch (e) {
        try { await tester.$disconnect(); } catch (e) {}
        if (tentativa < MAX_TENTATIVAS) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    return false;
  }

  async initializeFailover(): Promise<{ ativo: 'A'|'B'|'C'|null, prisma: PrismaClient|null }> {
    if (this.initializingPromise) {
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

    console.log('[CloudManager] Verificando conexões de banco de dados...');

    let novoPlano: 'A' | 'B' | 'C' | null = null;
    if (this.configs.planoA && await this.testConnection(this.configs.planoA)) {
      novoPlano = 'A';
    } else if (this.configs.planoB && await this.testConnection(this.configs.planoB)) {
      novoPlano = 'B';
    } else if (this.configs.planoC && await this.testConnection(this.configs.planoC)) {
      novoPlano = 'C';
    }

    if (!novoPlano) {
      if (this.prismaInstance) {
        console.log(`[CloudManager] Mantendo instância ativa existente (Plano ${this.planoAtivo || 'A'}).`);
        return { ativo: this.planoAtivo || 'A', prisma: this.prismaInstance };
      }
      const fallbackUrl = this.configs.planoA || DEFAULT_DB_URL;
      this.prismaInstance = new PrismaClient({ datasources: { db: { url: fallbackUrl } } });
      this.planoAtivo = 'A';
      return { ativo: 'A', prisma: this.prismaInstance };
    }

    let activeUrl = novoPlano === 'A' ? this.configs.planoA : novoPlano === 'B' ? this.configs.planoB : this.configs.planoC;

    console.log(`[CloudManager] Banco de dados ativo: Plano ${novoPlano}`);

    const novaInstancia = new PrismaClient({ datasources: { db: { url: activeUrl } } });
    await novaInstancia.$connect();
    const antiga = this.prismaInstance;
    this.prismaInstance = novaInstancia;
    this.planoAtivo = novoPlano;
    if (antiga && antiga !== novaInstancia) {
      antiga.$disconnect().catch(() => {});
    }
    return { ativo: novoPlano, prisma: novaInstancia };
  }

  getPrisma(): PrismaClient {
    if (!this.prismaInstance) {
      const url = this.configs.planoA || DEFAULT_DB_URL;
      this.prismaInstance = new PrismaClient({ datasources: { db: { url } } });
      this.planoAtivo = 'A';
    }
    return this.prismaInstance;
  }
  
  getAtivo() {
    return this.planoAtivo || 'A';
  }
  
  getConfigs() {
    return this.configs;
  }
}

export const cloudManager = new CloudManager();
