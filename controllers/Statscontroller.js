const mongoose = require('mongoose')

// ── GET statistiques détaillées par domaine ──────────────────
exports.getStatsDomaines = async (req, res) => {
  try {
    const Rapport = mongoose.models.Rapport
    const Domain  = mongoose.models.Domain

    const rapports = await Rapport.find({}).lean()
    if (rapports.length === 0) return res.json({ stats: [], totalRapports: 0 })

    const domains = await Domain.find().sort({ order: 1 }).lean()

    const stats = domains.map((domain, domIdx) => {
      let vraiTotal = 0, fauxTotal = 0, partielTotal = 0, auditsCount = 0, totalScore = 0
      const nbQuestions = domain.questions?.length || 1

      rapports.forEach(rapport => {
        const answers      = rapport.answers      || {}
        const domainScores = rapport.domainScores || {}
        const score        = domainScores[domIdx]
        let hasAnswer = false
        for (let qIdx = 0; qIdx < nbQuestions; qIdx++) {
          const key    = domIdx + '-' + qIdx
          const answer = answers[key]
          if (answer === true)           { vraiTotal++;    hasAnswer = true }
          else if (answer === false)     { fauxTotal++;    hasAnswer = true }
          else if (answer === 'partial') { partielTotal++; hasAnswer = true }
        }
        if (hasAnswer) { auditsCount++; totalScore += score || 0 }
      })

      const uniqueUsers = new Set(
        rapports
          .filter(r => Object.keys(r.answers || {}).some(k => k.startsWith(domIdx + '-')))
          .map(r => r.userEmail || 'anonyme')
      )

      return {
        label:            domain.label,
        clause:           domain.clause,
        ordre:            domIdx + 1,
        vrai:             vraiTotal,
        faux:             fauxTotal,
        partiel:          partielTotal,
        total:            auditsCount,
        personnesUniques: uniqueUsers.size,
        scoreMoyen:       auditsCount > 0 ? Math.round(totalScore / auditsCount) : 0,
      }
    })

    res.json({ stats, totalRapports: rapports.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
}