const mongoose = require('mongoose')

// ── Classe Administrateur (classe INDEPENDANTE) ───────────────
// L'Admin n'hérite PAS de Visiteur car :
// → Il n'accède PAS à la plateforme auditeur
// → Il ne s'inscrit PAS
// → Il accède UNIQUEMENT via @root au dashboard
// → Collection séparée : 'admins'

const administrateurSchema = new mongoose.Schema({
  nom:         { type: String, default: 'Admin' },
  email:       { type: String, default: 'admin@auditwise.com' },
  role:        { type: String, default: 'admin' },
  permissions: {
    type:    [String],
    default: ['gerer_users', 'gerer_campagnes', 'consulter_rapports', 'consulter_stats']
  },
  createdAt: { type: Date, default: Date.now },
}, {
  collection: 'admins', // collection SEPAREE de 'users'
})

administrateurSchema.methods.canManageUsers     = function() { return this.permissions.includes('gerer_users') }
administrateurSchema.methods.canManageCampagnes = function() { return this.permissions.includes('gerer_campagnes') }
administrateurSchema.methods.isAdmin            = function() { return this.role === 'admin' }
administrateurSchema.methods.canAudit           = function() { return false } // Admin ne fait PAS d'audit

const Administrateur = mongoose.models.Administrateur ||
  mongoose.model('Administrateur', administrateurSchema)

module.exports = Administrateur