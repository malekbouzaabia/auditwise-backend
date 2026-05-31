// ── Point d'entrée principal des modèles ─────────────────────
// Héritage :
// Visitor → Auditeur (hérite)
// Administrateur    (classe indépendante - pas d'héritage)

const Visitor        = require('./Visitor')        // classe de base
const Auditeur       = require('./Auditeur')       // hérite de Visitor
const Administrateur = require('./Administrateur') // classe indépendante

// Export principal = Visitor (retourne Visitor + Auditeur)
module.exports               = Visitor
module.exports.Visitor       = Visitor
module.exports.Auditeur      = Auditeur
module.exports.Administrateur = Administrateur