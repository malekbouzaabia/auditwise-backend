require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const path    = require('path')

const connectDB       = require('./config/db')
const authRoutes      = require('./routes/authRoutes')
const { documents }   = require('./document')
const DOMAINS_DEFAULT = require('./Domains')

const app = express()
connectDB()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use('/api/auth',     authRoutes)
app.use('/api/sessions', require('./routes/Chatroutes'))
app.use('/api/pdf',      require('./routes/pdfroutes'))

// ── Schéma MongoDB pour les domaines/questions ──────────────
const mongoose = require('mongoose')
const domainSchema = new mongoose.Schema({
  label:     { type: String, required: true },
  clause:    { type: String, default: null },
  icon:      { type: String, default: '📋' },
  order:     { type: Number, default: 0 },
  questions: [{ type: String }],
  source:    { type: String, default: 'default' },
  updatedAt: { type: Date, default: Date.now },
})
const Domain = mongoose.models.Domain || mongoose.model('Domain', domainSchema)

// ── Sync Domaines → MongoDB au démarrage ─────────────────────
async function syncDomainsToMongo() {
  try {
    const count = await Domain.countDocuments()
    if (count === 0) {
      await Domain.insertMany(DOMAINS_DEFAULT.map((d, i) => ({
        label: d.label, clause: d.clause, icon: d.icon || '📋',
        order: i, questions: d.questions, source: 'default'
      })))
      console.log('✅ Domaines importés dans MongoDB :', DOMAINS_DEFAULT.length, 'domaines')
    } else {
      console.log('✅ MongoDB contient déjà', count, 'domaines')
    }
  } catch (e) {
    console.error('❌ Erreur sync MongoDB:', e.message)
  }
}
setTimeout(syncDomainsToMongo, 2000)

// ── GET domaines depuis MongoDB ──────────────────────────────
app.get('/api/domains', async (req, res) => {
  try {
    const domains = await Domain.find().sort({ order: 1 }).lean()
    if (domains.length > 0) return res.json(domains)
    return res.json(DOMAINS_DEFAULT)
  } catch (e) {
    return res.json(DOMAINS_DEFAULT)
  }
})

// ── POST ajouter une question à un domaine ────────────────────
app.post('/api/domains/:id/questions', async (req, res) => {
  try {
    const { question } = req.body
    if (!question?.trim()) return res.status(400).json({ error: 'Question vide' })
    const domain = await Domain.findByIdAndUpdate(
      req.params.id,
      { $push: { questions: question.trim() }, updatedAt: new Date() },
      { returnDocument: 'after' }
    )
    if (!domain) return res.status(404).json({ error: 'Domaine introuvable' })
    res.json(domain)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE supprimer une question ─────────────────────────────
app.delete('/api/domains/:id/questions/:index', async (req, res) => {
  try {
    const domain = await Domain.findById(req.params.id)
    if (!domain) return res.status(404).json({ error: 'Domaine introuvable' })
    domain.questions.splice(parseInt(req.params.index), 1)
    domain.updatedAt = new Date()
    await domain.save()
    res.json(domain)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PUT modifier une question ─────────────────────────────────
app.put('/api/domains/:id/questions/:index', async (req, res) => {
  try {
    const { question } = req.body
    const domain = await Domain.findById(req.params.id)
    if (!domain) return res.status(404).json({ error: 'Domaine introuvable' })
    domain.questions[parseInt(req.params.index)] = question.trim()
    domain.updatedAt = new Date()
    await domain.save()
    res.json(domain)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── ChatController : RAG + helpers ───────────────────────────
const { getClauseFromDocument, buildRAGContext } = require('./controllers/chatController')

// ── Route chat avec DeepSeek + RAG ───────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { system, history, currentClause, questionIdx = 0 } = req.body
    const apiKey = process.env.DEEPSEEK_API_KEY
    console.log('🔑 DeepSeek:', apiKey ? '✅' : '❌ Manquante')
    if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY manquante' })

    const ragContext    = currentClause ? buildRAGContext(currentClause, questionIdx) : ''
    const systemWithRAG = ragContext ? system + '\n\n' + ragContext : system

    const messages = [
      { role: 'system', content: systemWithRAG },
      ...history.map(h => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts,
      }))
    ]

    let response, data, retries = 0
    while (retries < 3) {
      response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 200, temperature: 0.3 }),
      })
      data = await response.json()
      if (!data.error || data.error.code !== 'rate_limit_exceeded') break
      const wait = parseInt(data.error.message.match(/try again in (\d+)/)?.[1] || '5') * 1000 + 1000
      console.log('⏳ Rate limit, attente', wait, 'ms')
      await new Promise(r => setTimeout(r, Math.min(wait, 15000)))
      retries++
    }
    if (data.error) {
      const msg = data.error.message || ''
      const waitMatch = msg.match(/try again in ([^.]+)/)
      const waitTime = waitMatch ? waitMatch[1].trim() : 'quelques minutes'
      return res.status(429).json({ error: { message: 'rate_limit', waitTime, raw: msg } })
    }
    const text = data.choices?.[0]?.message?.content
    if (!text) return res.status(500).json({ error: 'Réponse vide' })
    res.json({ text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Sprint 4 Controllers ─────────────────────────────────────
const statsCtrl   = require('./controllers/statsController')
const sessionCtrl = require('./controllers/sessionController')

// ── Route Admin Sessions ──────────────────────────────────────
app.get('/api/admin/sessions', sessionCtrl.getAdminSessions)

// ── Sprint 3 Controllers ─────────────────────────────────────
const campagneCtrl = require('./controllers/campagneController')
const rapportCtrl  = require('./controllers/rapportController')
const { Campagne, Rapport } = campagneCtrl

// ── Routes Campagnes ──────────────────────────────────────────
app.get('/api/campagnes/active',              campagneCtrl.getCampagneActive)
app.get('/api/campagnes',                     campagneCtrl.getAllCampagnes)
app.post('/api/campagnes',                    campagneCtrl.createCampagne)
app.delete('/api/campagnes/:id',              campagneCtrl.deleteCampagne)
app.put('/api/campagnes/:id/edit',            campagneCtrl.editCampagne)
app.put('/api/campagnes/:id/fermer',          campagneCtrl.fermerCampagne)
app.get('/api/campagnes/check/:userEmail',    campagneCtrl.checkCampagne)
app.get('/api/campagnes/:id/participants',    campagneCtrl.getParticipants)

// ── Routes Rapports ───────────────────────────────────────────
app.post('/api/rapports/save',               rapportCtrl.saveRapport)
app.get('/api/rapports',                     rapportCtrl.getRapports)
app.delete('/api/rapports/clear',            rapportCtrl.clearRapports)
app.delete('/api/rapports/:id',              rapportCtrl.deleteRapport)
app.post('/api/rapports/send-email',         rapportCtrl.sendEmail)

// ── Route Réclamations ────────────────────────────────────────
app.post('/api/reclamations',                rapportCtrl.reclamations)

// ── Route Statistiques ───────────────────────────────────────
app.get('/api/stats/domaines', statsCtrl.getStatsDomaines)

// ── Test ──────────────────────────────────────────────────────
app.get('/api/stats/test', (req, res) => res.json({ message: 'Stats route OK' }))

app.get('/api/test', (req, res) => {
  res.json({ status: 'OK', message: 'API AuditWise — DeepSeek + RAG ISO 27001:2022', documentsCount: documents.length, domainsCount: DOMAINS_DEFAULT.length })
})

app.get('/', (req, res) => res.send('API AuditWise — DeepSeek + RAG ISO 27001:2022'))

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log('✅ Serveur lancé sur le port ' + PORT))