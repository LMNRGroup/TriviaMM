export interface UniversityOption {
  name: string;
  acronym: string;
}

export const UNIVERSITY_OPTIONS: UniversityOption[] = [
  { name: "Universidad de Puerto Rico Recinto de Río Piedras", acronym: "UPRRP" },
  { name: "Universidad de Puerto Rico Recinto Universitario de Mayagüez", acronym: "UPRM" },
  { name: "Universidad de Puerto Rico Recinto de Bayamón", acronym: "UPRB" },
  { name: "Universidad de Puerto Rico Recinto de Humacao", acronym: "UPRH" },
  { name: "Universidad de Puerto Rico Recinto de Carolina", acronym: "UPRC" },
  { name: "Universidad de Puerto Rico Recinto de Aguadilla", acronym: "UPRAg" },
  { name: "Universidad de Puerto Rico Recinto de Utuado", acronym: "UPRU" },
  { name: "Universidad de Puerto Rico en Cayey", acronym: "UPRCa" },
  { name: "Universidad Interamericana de Puerto Rico", acronym: "UIPR" },
  { name: "Universidad Ana G. Méndez", acronym: "UAGM" },
  { name: "Universidad del Sagrado Corazón", acronym: "USC" },
  { name: "Universidad Politécnica de Puerto Rico", acronym: "UPPR" },
  { name: "Caribbean University", acronym: "CU" },
  { name: "Pontificia Universidad Católica de Puerto Rico", acronym: "PUCPR" },
  { name: "Universidad Central de Bayamón", acronym: "UCB" },
];

const universityByName = new Map(UNIVERSITY_OPTIONS.map((item) => [item.name, item]));

export function getUniversityByName(name: string) {
  return universityByName.get(name.trim()) ?? null;
}
