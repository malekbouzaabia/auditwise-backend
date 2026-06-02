const mongoose = require('mongoose')

const rapportSchema = new mongoose.Schema({
  userId:      { type: String, default: null },
  userEmail:   { type: String, default: null },
  globalScore: { type: Number, default: 0 },
  domainScores:{ type: mongoose.Schema.Types.Mixed, default: {} },
  domainsData: { type: mongoose.Schema.Types.Mixed, default: [] },
  answers:     { type: mongoose.Schema.Types.Mixed, default: {} },
  campagneId:  { type: mongoose.Schema.Types.ObjectId, default: null },
  campagneNom: { type: String, default: null },
  statut:      { type: String, default: 'généré' },
  createdAt:   { type: Date,   default: Date.now },
})

module.exports = mongoose.models.Rapport || mongoose.model('Rapport', rapportSchema)