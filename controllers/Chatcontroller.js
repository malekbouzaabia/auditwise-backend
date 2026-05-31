const { documents } = require('../document')

// ── Mapping clauses ──────────────────────────────────────────
const CLAUSE_MAPPING = {
  '5.2':   '5.2 Policy',
  '5.15':  '5.15 Access control',
  '6.3':   '6.3 Information security awareness, education and training',
  '5.9':   '5.9 Inventory of information and other associated assets',
  '8.24':  '8.24 Use of cryptography',
  '7.1':   '7.1 Physical security perimeters',
  '5.24':  '5.24 Information security incident management planning and preparation',
  '8.20':  '8.20 Networks security',
  '5.30':  '5.30 ICT readiness for business continuity',
  '9.2.1': '9.2.1 General',
}

// ── RAG ──────────────────────────────────────────────────────
function getClauseFromDocument(clauseId) {
  const cleanId = clauseId?.toString().trim()
  if (!cleanId) return null
  const exactTitle = CLAUSE_MAPPING[cleanId]
  if (exactTitle) {
    const clause = documents.find(doc => doc.title === exactTitle)
    if (clause) return clause
  }
  let clause = documents.find(doc => doc.title.startsWith(cleanId + ' '))
  if (clause) return clause
  clause = documents.find(doc => doc.title.startsWith(cleanId))
  if (clause) return clause
  return documents.find(doc => doc.title.includes(cleanId)) || null
}

const DOMAIN_CLAUSES = {
  '5.2':  ['5.2 Policy', '5.1 Leadership and commitment', '5.3 Organizational roles, responsibilities and authorities', '6.2 Information security objectives and planning to achieve them', '6.1.2 Information security risk assessment', '6.1.3 Information security risk treatment'],
  '6.3':  ['6.3 Information security awareness, education and training', '6.1 Screening', '6.2 Terms and conditions of employment', '6.4 Disciplinary process', '6.5 Responsibilities after termination or change of employment', '6.6 Confidentiality or non-disclosure agreements'],
  '5.9':  ['5.9 Inventory of information and other associated assets', '5.10 Acceptable use of information and other associated assets', '5.12 Classification of information', '5.13 Labelling of information', '5.14 Information transfer', '5.11 Return of assets'],
  '5.15': ['5.15 Access control', '5.16 Identity management', '5.17 Authentication information', '5.18 Access rights', '8.2 Privileged access rights', '8.5 Secure authentication'],
  '8.24': ['8.24 Use of cryptography'],
  '7.1':  ['7.1 Physical security perimeters', '7.2 Physical entry', '7.3 Securing offices, rooms and facilities', '7.4 Physical security monitoring', '7.5 Protecting against physical and environmental threats', '7.7 Clear desk and clear screen'],
  '8.8':  ['8.8 Management of technical vulnerabilities', '8.13 Information backup', '8.15 Logging', '8.16 Monitoring activities', '8.7 Protection against malware', '8.9 Configuration management', '8.19 Installation of software on operational systems', '8.31 Separation of development, test and production environments', '8.32 Change management'],
  '8.20': ['8.20 Networks security', '8.21 Security of network services', '8.22 Segregation of networks', '8.23 Web filtering'],
  '8.25': ['8.25 Secure development life cycle', '8.26 Application security requirements', '8.27 Secure system architecture and engineering principles', '8.28 Secure coding', '8.29 Security testing in development and acceptance', '8.31 Separation of development, test and production environments'],
  '5.19': ['5.19 Information security in supplier relationships', '5.20 Addressing information security within supplier agreements', '5.22 Monitoring, review and change management of supplier services'],
  '5.24': ['5.24 Information security incident management planning and preparation', '5.25 Assessment and decision on information security events', '5.26 Response to information security incidents', '5.27 Learning from information security incidents'],
  '5.30': ['5.30 ICT readiness for business continuity', '5.29 Information security during disruption'],
  '5.36': ['5.36 Compliance with policies, rules and standards for information security', '9.2.1 General', '9.2.2 Internal audit programme', '5.31 Legal, statutory, regulatory and contractual requirements', '10.2 Nonconformity and corrective action'],
}

function buildRAGContext(currentClause, questionIdx = 0) {
  const cleanId = currentClause?.toString().trim()
  if (!cleanId) return ''
  const relatedTitles = DOMAIN_CLAUSES[cleanId] || []
  if (relatedTitles.length === 0) {
    const clause = getClauseFromDocument(cleanId)
    if (!clause) return ''
    return 'CLAUSES ISO 27001 DU DOMAINE:\n[1] ' + clause.title + ': ' + clause.snippet
  }
  const parts = []
  relatedTitles.forEach((title, i) => {
    const doc = documents.find(d => d.title === title)
    if (doc) parts.push('[Clause ' + (i+1) + '] ' + doc.title + ': ' + doc.snippet.slice(0, 180))
  })
  return 'CLAUSES AUTORISEES POUR CE DOMAINE (pose des questions UNIQUEMENT sur ces clauses):\n' + parts.join('\n')
}

module.exports = { getClauseFromDocument, buildRAGContext }