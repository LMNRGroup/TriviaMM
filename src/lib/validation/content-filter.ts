const BLOCKED_NAME_TERMS = new Set([
  "asshole",
  "bastard",
  "bitch",
  "cabron",
  "cabrona",
  "carajo",
  "coño",
  "cunt",
  "dick",
  "fuck",
  "mierda",
  "nigger",
  "peludo",
  "pendeja",
  "pendejo",
  "puta",
  "puto",
  "shit",
  "toto",
  "verga",
  "whore",
]);

const BLOCKED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "yopmail.com",
]);

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function findBlockedNameTerm(value: string) {
  const normalized = normalizeText(value);
  const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 0);

  for (const token of tokens) {
    if (BLOCKED_NAME_TERMS.has(token)) {
      return token;
    }
  }

  return null;
}

export function isAllowedRegistrationEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

  if (!emailPattern.test(normalized)) {
    return false;
  }

  if (normalized.includes("..")) {
    return false;
  }

  const domain = normalized.split("@")[1] ?? "";
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) {
    return false;
  }

  return true;
}
