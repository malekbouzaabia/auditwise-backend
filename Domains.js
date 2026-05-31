// ── Domaines ISO 27001:2022 ───────────────────────────────────
// 13 domaines : label, clause, icon uniquement
// Les questions sont générées par DeepSeek AI automatiquement

const DOMAINS_DEFAULT = [
  { label: "Gouvernance & Leadership",    clause: "5.2",   icon: "🏛️", order: 0  },
  { label: "Ressources Humaines",         clause: "6.3",   icon: "👥", order: 1  },
  { label: "Gestion des Actifs",          clause: "5.9",   icon: "📦", order: 2  },
  { label: "Contrôle d'accès & Identité", clause: "5.15",  icon: "🔐", order: 3  },
  { label: "Cryptographie",               clause: "8.24",  icon: "🔒", order: 4  },
  { label: "Sécurité Physique",           clause: "7.1",   icon: "🏢", order: 5  },
  { label: "Sécurité Opérationnelle",     clause: "8.8",   icon: "⚙️", order: 6  },
  { label: "Réseau & Communications",     clause: "8.20",  icon: "🌐", order: 7  },
  { label: "Développement & Acquisition", clause: "8.25",  icon: "💻", order: 8  },
  { label: "Fournisseurs",                clause: "5.19",  icon: "🤝", order: 9  },
  { label: "Gestion des Incidents",       clause: "5.24",  icon: "🚨", order: 10 },
  { label: "Continuité d'activité",       clause: "5.30",  icon: "♻️", order: 11 },
  { label: "Conformité & Audit",          clause: "5.36",  icon: "✅", order: 12 },
]

module.exports = DOMAINS_DEFAULT