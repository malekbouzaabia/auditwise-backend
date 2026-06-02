const mongoose = require('mongoose')

const campagneSchema = new mongoose.Schema({
  nom:        { type: String, required: true },
  statut:     { type: String, default: 'planifiee' },
  dateDebut:  { type: Date,   required: true },
  dateFin:    { type: Date,   required: true },
  createdAt:  { type: Date,   default: Date.now },
  closedAt:   { type: Date,   default: null },
})

module.exports = mongoose.models.Campagne || mongoose.model('Campagne', campagneSchema)