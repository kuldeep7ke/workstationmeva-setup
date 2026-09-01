function randChar(): string {
  return String.fromCharCode(97 + Math.floor(Math.random() * 26));
}

function randFrom(s: string, count: number): string {
  let result = '';
  for (let i = 0; i < count; i++) {
    result += s[Math.floor(Math.random() * s.length)];
  }
  return result;
}

export function generateUsername(fullName: string, existingUsernames: Set<string>): string {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) {
    let base = parts[0] || fullName.toLowerCase().replace(/[^a-z]/g, '');
    if (!base) base = 'user';
    if (!existingUsernames.has(base)) return base;
    // try adding random letters
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = base + randFrom(base, 2);
      if (!existingUsernames.has(candidate)) return candidate;
    }
    return base + randFrom('abcdefghijklmnopqrstuvwxyz', 3);
  }

  const first = parts[0].replace(/[^a-z]/g, '');
  const last = parts[parts.length - 1].replace(/[^a-z]/g, '');

  // 1) first letter of first + first letter of last
  let username = first[0] + last[0];
  if (!existingUsernames.has(username)) return username;

  // 2) first letter of first + last two of last
  if (last.length >= 2) {
    username = first[0] + last.slice(-2);
    if (!existingUsernames.has(username)) return username;
  }

  // 3) two letters from first + two from last
  if (first.length >= 2 && last.length >= 2) {
    username = first.slice(0, 2) + last.slice(0, 2);
    if (!existingUsernames.has(username)) return username;
  }

  // 4) first letter of first + random letters from last
  for (let attempt = 0; attempt < 10; attempt++) {
    username = first[0] + randFrom(last, 2);
    if (!existingUsernames.has(username)) return username;
  }

  // 5) first letter of first + 2 random letters
  for (let attempt = 0; attempt < 20; attempt++) {
    username = first[0] + randChar() + randChar();
    if (!existingUsernames.has(username)) return username;
  }

  return first[0] + randFrom('abcdefghijklmnopqrstuvwxyz', 3);
}
