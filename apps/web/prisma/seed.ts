import { config } from 'dotenv';
config({ path: new URL('../../../.env', import.meta.url).pathname });
config({ path: new URL('../.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_SENHA;
  const nome = process.env.ADMIN_NOME ?? 'Administrador';

  if (!email || !senha) {
    throw new Error('ADMIN_EMAIL e ADMIN_SENHA devem estar definidos no .env');
  }

  const dados = {
    email,
    senha_hash: await hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
    nome_completo: nome,
  };

  await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { ...dados, perfil: 'ADMIN', ativo: true },
  });

  console.log(`ADMIN pronto: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
