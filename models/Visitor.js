const mongoose = require('mongoose')

// ── Classe Visiteur (classe de base) ─────────────────────────
// Le visiteur s'inscrit → contient toutes les infos d'inscription

const visitorSchema = new mongoose.Schema({
  role:        { type: String, default: 'visitor', enum: ['visitor', 'user'] },
  nom:         { type: String, default: '' },
  prenom:      { type: String, default: '' },
  email:       { type: String, default: null },
  password:    { type: String, default: null },
  entreprise:  { type: String, default: '' },
  taille:      { type: String, default: '' },
  telephone:   { type: String, default: '' },
  isVerified:  { type: Boolean, default: false },
  mfaCode:     { type: String,  default: null },
  mfaExpires:  { type: Date,    default: null },
}, {
  timestamps:       true,
  discriminatorKey: 'role',
  collection:       'users',
})

visitorSchema.methods.canRegister = function() { return true }
visitorSchema.methods.canAudit    = function() { return false }
visitorSchema.methods.isVisitor   = function() { return this.role === 'visitor' }

const Visitor = mongoose.models.Visitor || mongoose.model('Visitor', visitorSchema)

module.exports = Visitor