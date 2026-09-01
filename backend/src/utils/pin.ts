import bcrypt from 'bcryptjs';

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

export function verifyPin(stored: string, input: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('$2')) {
    return bcrypt.compareSync(input, stored);
  }
  return stored === input;
}

export function pinNeedsUpgrade(stored: string): boolean {
  return !!stored && !stored.startsWith('$2');
}
