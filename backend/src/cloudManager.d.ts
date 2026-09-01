import { PrismaClient } from '@prisma/client';
export interface CloudConfigs {
    planoA: string;
    planoB: string;
    planoC: string;
}
declare class CloudManager {
    private configs;
    private planoAtivo;
    private prismaInstance;
    loadConfigs(): Promise<CloudConfigs>;
    saveConfigs(novasConfigs: CloudConfigs): Promise<void>;
    private testConnection;
    initializeFailover(): Promise<{
        ativo: 'A' | 'B' | 'C' | null;
        prisma: PrismaClient | null;
    }>;
    getPrisma(): PrismaClient;
    getAtivo(): "A" | "B" | "C" | null;
    getConfigs(): CloudConfigs;
}
export declare const cloudManager: CloudManager;
export {};
//# sourceMappingURL=cloudManager.d.ts.map