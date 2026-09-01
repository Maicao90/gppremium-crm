import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
export declare const io: Server<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
export declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export declare const usuariosConectados: Map<string, string>;
//# sourceMappingURL=server.d.ts.map