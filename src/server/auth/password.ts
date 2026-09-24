import { hash, verify } from "@node-rs/argon2";

// argon2id — алгоритм @node-rs/argon2 по умолчанию; хеш начинается с $argon2id$.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
