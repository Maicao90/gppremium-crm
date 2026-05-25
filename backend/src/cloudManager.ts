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

  // Testa uma URL usando o próprio Prisma de forma efêmera
  private async testConnection(url: string): Promise<boolean> {
    if (!url || !url.startsWith('postgres')) return false;
    
    const tester = new PrismaClient({
      datasources: { db: { url } }
    });
    
    try {
      // Timeout de 5 segundos
      await Promise.race([
        tester.$connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      await tester.$disconnect();
      return true;
    } catch (e) {
      console.log(`[CloudManager] Falha ao testar URL: ${url.split('@')[1] || 'URL Inválida'}`);
      try { await tester.$disconnect(); } catch(e){}
      return false;
    }
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
      
      try {
        console.log('[CloudManager] Sincronizando tabelas do Prisma com a nuvem...');
        const { execSync } = require('child_process');
        execSync('npx prisma db push --accept-data-loss', { 
          env: { ...process.env, DATABASE_URL: activeUrl },
          stdio: 'inherit' 
        });
        console.log('[CloudManager] Tabelas da nuvem criadas/sincronizadas com sucesso!');
      } catch (e) {
        console.error('[CloudManager] Erro ao sincronizar Prisma com a Nuvem:', e);
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
