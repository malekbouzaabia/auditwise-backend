const mongoose = require('mongoose')
const Visitor  = require('./Visitor')

// ── Classe Auditeur (hérite de Visiteur) ─────────────────────
// Hérite de Visiteur : nom, email, password
// → nom      : pour afficher l'avatar/logo
// → email    : pour se connecter
// → password : pour s'authentifier
// L'Auditeur utilise ces 3 attributs hérités
// pour accéder à l'application et faire l'audit

const auditeurSchema = new mongoose.Schema({
  // Pas de nouveaux attributs
  // Hérite nom, email, password de Visiteur ✅
})

auditeurSchema.methods.canAudit          = function() { return this.isVerified }
auditeurSchema.methods.canDownloadReport = function() { return this.isVerified }
auditeurSchema.methods.isAuditeur        = function() { return this.role === 'user' }

const Auditeur = Visitor.discriminators?.user ||
  Visitor.discriminator('user', auditeurSchema)

module.exports = Auditeur