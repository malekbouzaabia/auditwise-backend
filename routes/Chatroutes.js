const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')

// ── Middleware JWT ────────────────────────────────────────────
function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    // Email depuis header custom
    req.userEmail = req.headers['x-user-email'] || null
    if (!token) {
      req.userId = req.userEmail || 'anonymous'
      return next()
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.userId    = decoded.id || decoded._id || decoded.userId
    req.userEmail = req.userEmail || decoded.email || null
    next()
  } catch (err) {
    req.userId    = req.headers['x-user-email'] || 'anonymous'
    req.userEmail = req.headers['x-user-email'] || null
    next()
  }
}

// ── Schéma Session avec userId ────────────────────────────────
const sessionSchema = new mongoose.Schema({
  sessionId:    { type: String, required: true, unique: true },
  userId:       { type: String, required: false, default: null },
  userEmail:    { type: String, required: false, default: null },
  title:        { type: String, default: 'Session ISO 27001' },
  messages:     { type: Array,  default: [] },
  history:      { type: Array,  default: [] },
  score:        { type: Number, default: null },
  domains:      { type: Array,  default: [] },
  campagneId:   { type: mongoose.Schema.Types.Mixed, default: null },
  // ── État de l'audit pour reprise exacte ──────────────────
  auditState:   {
    currentDomainIdx: { type: Number, default: 0 },
    currentQIdx:      { type: Number, default: 0 },
    answers:          { type: mongoose.Schema.Types.Mixed, default: {} },
    domainScores:     { type: mongoose.Schema.Types.Mixed, default: {} },
    domainStatuses:   { type: mongoose.Schema.Types.Mixed, default: {} },
    finalScore:       { type: Number, default: null },
  },
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now },
})

const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema)

// ── GET toutes les sessions de l'utilisateur connecté ────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .select('sessionId title score createdAt updatedAt messages')
    res.json(sessions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET une session par ID ────────────────────────────────────
router.get('/:sessionId', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findOne({
      sessionId: req.params.sessionId,
      userId: req.userId   // ← seulement ses sessions
    })
    if (!session) return res.status(404).json({ error: 'Session introuvable' })
    res.json(session)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST créer ou mettre à jour une session ───────────────────
router.post('/save', authMiddleware, async (req, res) => {
  try {
    const { sessionId, title, messages, history, score, domains, campagneId, auditState, userEmail } = req.body
    const resolvedEmail = userEmail || req.userEmail || req.headers['x-user-email'] || null
    console.log('💾 Save session - userId:', req.userId, '| email:', resolvedEmail, '| campagneId:', campagneId)
    // Chercher par sessionId uniquement (pas userId) pour éviter de créer des doublons
    const session = await Session.findOneAndUpdate(
      { sessionId },
      { sessionId, userId: req.userId, userEmail: resolvedEmail, title, messages, history, score, domains, campagneId: campagneId || null, auditState: auditState || {}, updatedAt: new Date() },
      { upsert: true, returnDocument: 'after' }
    )
    res.json(session)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET session existante pour une campagne ──────────────────
router.get('/campagne/:campagneId', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findOne({
      userId:     req.userId,
      campagneId: req.params.campagneId,
    }).sort({ updatedAt: -1 })
    res.json(session || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE supprimer une session ──────────────────────────────
router.delete('/:sessionId', authMiddleware, async (req, res) => {
  try {
    await Session.findOneAndDelete({
      sessionId: req.params.sessionId,
      userId: req.userId   // ← seulement ses sessions
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router