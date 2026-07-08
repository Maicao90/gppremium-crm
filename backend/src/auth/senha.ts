import bcrypt from 'bcryptjs';

// Hash bcrypt sempre começa com "$2a$/$2b$/$2y$". Se não começar, é senha
// LEGADA (texto puro do sistema antigo) e deve ser migrada.
export const ehHash = (valor: string): boolean => /^\$2[aby]\$/.test(valor || '');

export const hashSenha = async (senha: string): Promise<string> => bcrypt.hash(senha, 10);

// Verifica aceitando tanto hash quanto senha legada (texto puro) durante a migração.
export const conferirSenha = async (senhaDigitada: string, senhaSalva: string): Promise<boolean> => {
  if (!senhaSalva) return false;
  if (ehHash(senhaSalva)) return bcrypt.compare(senhaDigitada, senhaSalva);
  return senhaDigitada === senhaSalva; // legada: comparação direta (só até migrar)
};
