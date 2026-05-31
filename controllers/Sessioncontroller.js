const mongoose = require('mongoose')

// ── GET sessions groupées par utilisateur (Admin) ────────────
exports.getAdminSessions = async (req, res) => {
  try {
    const Session = mongoose.models.Session
    if (!Session) return res.json([])

    const sessions = await Session.find()
      .sort({ updatedAt: -1 })
      .select('sessionId userId title score messages updatedAt createdAt')
      .lean()

    const User = mongoose.models.User
    const sessionsWithEmail = await Promise.all(sessions.map(async (s) => {
      let userEmail = s.userId || 'Anonyme'
      if (s.userId && User) {
        try {
          const user = await User.findById(s.userId).select('email nom name').lean()
          if (user) userEmail = user.email || user.nom || user.name || s.userId
        } catch (e) {}
      }
      return { ...s, userEmail }
    }))

    const grouped = {}
    for (const s of sessionsWithEmail) {
      const key = s.userEmail
      if (!grouped[key]) {
        grouped[key] = { userEmail: key, totalSessions: 0, totalMessages: 0, lastScore: null, lastDate: null }
      }
      grouped[key].totalSessions += 1
      grouped[key].totalMessages += (s.messages?.length || 0)
      if (s.score != null) grouped[key].lastScore = s.score
      if (!grouped[key].lastDate || new Date(s.updatedAt) > new Date(grouped[key].lastDate)) {
        grouped[key].lastDate = s.updatedAt
      }
    }

    res.json(Object.values(grouped).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}