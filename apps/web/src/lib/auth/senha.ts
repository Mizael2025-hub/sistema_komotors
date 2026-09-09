import { hash, verify } from '@node-rs/argon2';

const opcoes = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function gerarHashSenha(senha: string) {
  return hash(senha, opcoes);
}

export function conferirSenha(hashSalvo: string, senha: string) {
  return verify(hashSalvo, senha);
}
