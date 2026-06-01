const mongoose   = require('mongoose')
const nodemailer = require('nodemailer')
const { getClauseFromDocument } = require('./Chatcontroller')

// ── Schéma Campagne ───────────────────────────────────────────
const campagneSchema = new mongoose.Schema({
  nom:        { type: String, required: true },
  statut:     { type: String, default: 'planifiee' },
  dateDebut:  { type: Date,   required: true },
  dateFin:    { type: Date,   required: true },
  createdAt:  { type: Date,   default: Date.now },
  closedAt:   { type: Date,   default: null },
})
const Campagne = mongoose.models.Campagne || mongoose.model('Campagne', campagneSchema)

// ── Schéma Rapport ────────────────────────────────────────────
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
const Rapport = mongoose.models.Rapport || mongoose.model('Rapport', rapportSchema)

// ── NodeMailer ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   '74.125.133.108',
  port:    587,
  secure:  false,
  auth: { user: process.env.MAIL_USER || '', pass: process.env.MAIL_PASS || '' },
  tls: { rejectUnauthorized: false, servername: 'smtp.gmail.com' },
  family: 4
})

// ── Générer rapport collectif campagne ────────────────────────
async function generateCampaignReport(campagneId, campagne) {
  try {
    const rapports = await Rapport.find({ campagneId }).lean()
    if (!rapports.length) { console.log('⚠️ Aucun rapport pour la campagne', campagneId); return }

    const Domain = mongoose.models.Domain
    const domains = await Domain.find().sort({ order: 1 }).lean()

    const domainScores = domains.map((d, dIdx) => {
      let total = 0, count = 0
      rapports.forEach(r => {
        const ds = r.domainScores || {}
        if (ds[dIdx] !== undefined) { total += ds[dIdx]; count++ }
      })
      return { label: d.label, clause: d.clause, score: count > 0 ? Math.round(total / count) : 0, participants: count }
    })

    const globalScore = Math.round(domainScores.reduce((a,d) => a + d.score, 0) / domainScores.length)
    const weakDomains = domainScores.filter(d => d.score < 70).sort((a,b) => a.score - b.score).slice(0, 6)

    const recommendations = []
    for (const wd of weakDomains) {
      try {
        const clauseInfo = getClauseFromDocument(wd.clause)
        const prompt = `Domaine ISO 27001 : "${wd.label}" (Clause ${wd.clause})\nScore moyen : ${wd.score}%\n${clauseInfo ? 'Exigence ISO : "' + clauseInfo.snippet.slice(0,200) + '"' : ''}\nEn 2 phrases : 1. CAUSES: ... 2. RECOMMANDATION: ...\nFormat:\nCAUSES: [texte]\nRECOMMANDATION: [texte]`
        const apiKey = process.env.DEEPSEEK_API_KEY
        const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 150, temperature: 0.3 })
        })
        const data = await r.json()
        const text = data.choices?.[0]?.message?.content || ''
        const causesMatch = text.match(/CAUSES[:\s]+(.+?)(?=RECOMMANDATION|$)/si)
        const recMatch    = text.match(/RECOMMANDATION[:\s]+(.+)/si)
        recommendations.push({ ...wd, causes: causesMatch?.[1]?.trim() || null, recommandation: recMatch?.[1]?.trim() || null })
        await new Promise(r => setTimeout(r, 500))
      } catch(e) {
        recommendations.push({ ...wd, causes: null, recommandation: 'Mettre en conformite avec la clause ' + wd.clause + ' ISO 27001:2022.' })
      }
    }

    const pdfRes = await fetch('http://localhost:' + (process.env.PORT || 5000) + '/api/pdf/rapport-campagne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campagne, rapports, domainScores, globalScore, recommendations })
    })
    if (!pdfRes.ok) throw new Error('PDF generation failed')
    const pdfBlob = await pdfRes.arrayBuffer()
    const pdfB64  = Buffer.from(pdfBlob).toString('base64')

    const auditeurEmail = process.env.AUDITEUR_EMAIL || process.env.ADMIN_EMAIL
    if (auditeurEmail) {
      await transporter.sendMail({
        from: `"AuditWise AI" <${process.env.MAIL_USER}>`,
        to: auditeurEmail,
        subject: `Rapport Campagne "${campagne.nom}" — Score: ${globalScore}% — ${rapports.length} participant(s)`,
        html: `<h2>Campagne : ${campagne.nom}</h2><p>Score global : ${globalScore}%</p><p>Participants : ${rapports.length}</p>`,
        attachments: [{ filename: `Rapport_Campagne_${(campagne.nom||'').replace(/\s/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`, content: pdfB64, encoding: 'base64', contentType: 'application/pdf' }]
      })
      console.log('✅ Rapport campagne envoyé à:', auditeurEmail)
    }

    await Rapport.create({
      userId: null, userEmail: 'RAPPORT_COLLECTIF_' + (campagne.nom || campagneId),
      globalScore, domainScores: Object.fromEntries(domainScores.map((d, i) => [i, d.score])),
      domainsData: domainScores.map(d => ({ label: d.label, clause: d.clause, score: d.score })),
      answers: {}, campagneId, campagneNom: campagne.nom || null,
      statut: globalScore >= 70 ? 'conforme' : globalScore >= 40 ? 'partiel' : 'non-conforme',
      createdAt: new Date()
    })
    console.log('✅ Rapport collectif sauvegardé en MongoDB')
  } catch(e) {
    console.error('❌ Erreur rapport campagne:', e.message)
  }
}

// ── GET campagne active ───────────────────────────────────────
exports.getCampagneActive = async (req, res) => {
  try {
    const now = new Date()
    await Campagne.updateMany({ statut: 'planifiee', dateDebut: { $lte: now } }, { statut: 'ouverte' })
    await Campagne.updateMany({ statut: 'ouverte', dateFin: { $lt: now } }, { statut: 'fermee', closedAt: now })
    const campagne = await Campagne.findOne({ statut: 'ouverte' }).sort({ dateDebut: -1 })
    res.json(campagne || null)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── GET toutes les campagnes ──────────────────────────────────
exports.getAllCampagnes = async (req, res) => {
  try {
    const now = new Date()
    await Campagne.updateMany({ statut: 'planifiee', dateDebut: { $lte: now } }, { statut: 'ouverte' })
    const expiredCamps = await Campagne.find({ statut: 'ouverte', dateFin: { $lt: now } }).lean()
    await Campagne.updateMany({ statut: 'ouverte', dateFin: { $lt: now } }, { statut: 'fermee', closedAt: now })
    for (const ec of expiredCamps) {
      setImmediate(() => generateCampaignReport(ec._id.toString(), ec))
    }
    const campagnes = await Campagne.find().sort({ createdAt: -1 }).lean()
    const result = await Promise.all(campagnes.map(async c => {
      const rapports = await Rapport.find({ campagneId: c._id }).lean()
      return { ...c, totalAudits: rapports.length, scoreMoyen: rapports.length > 0 ? Math.round(rapports.reduce((a, r) => a + (r.globalScore || 0), 0) / rapports.length) : 0 }
    }))
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── POST créer une campagne ───────────────────────────────────
exports.createCampagne = async (req, res) => {
  try {
    const { nom, dateDebut, dateFin } = req.body
    if (!nom?.trim())  return res.status(400).json({ error: 'Nom requis' })
    if (!dateDebut)    return res.status(400).json({ error: 'Date début requise' })
    if (!dateFin)      return res.status(400).json({ error: 'Date fin requise' })
    const [dy, dm, dd] = dateDebut.split('-').map(Number)
    const [fy, fm, fd] = dateFin.split('-').map(Number)
    const debut  = new Date(dy, dm - 1, dd, 0,  0,  0)
    const fin    = new Date(fy, fm - 1, fd, 23, 59, 59)
    const now    = new Date()
    if (new Date(fy, fm-1, fd) < new Date(dy, dm-1, dd)) return res.status(400).json({ error: 'Date fin doit être après ou égale à la date début' })
    const statut = debut <= now ? 'ouverte' : 'planifiee'
    if (statut === 'ouverte') await Campagne.updateMany({ statut: 'ouverte' }, { statut: 'fermee', closedAt: now })
    const campagne = await Campagne.create({ nom: nom.trim(), dateDebut: debut, dateFin: fin, statut })
    res.json(campagne)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── DELETE supprimer une campagne ─────────────────────────────
exports.deleteCampagne = async (req, res) => {
  try {
    await Campagne.findByIdAndDelete(req.params.id)
    res.json({ message: 'Campagne supprimée' })
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── PUT modifier une campagne ─────────────────────────────────
exports.editCampagne = async (req, res) => {
  try {
    const { nom, dateDebut, dateFin } = req.body
    if (!nom?.trim() || !dateDebut || !dateFin) return res.status(400).json({ error: 'Champs requis' })
    const [dy, dm, dd] = dateDebut.split('-').map(Number)
    const [fy, fm, fd] = dateFin.split('-').map(Number)
    if (new Date(fy, fm-1, fd) < new Date(dy, dm-1, dd)) return res.status(400).json({ error: 'Date fin doit être après date début' })
    const now   = new Date()
    const debut = new Date(dy, dm - 1, dd, 0, 0, 0)
    const fin   = new Date(fy, fm - 1, fd, 23, 59, 59)
    const statut = debut <= now && fin >= now ? 'ouverte' : debut > now ? 'planifiee' : 'fermee'
    const campagne = await Campagne.findByIdAndUpdate(req.params.id, { nom: nom.trim(), dateDebut: debut, dateFin: fin, statut }, { returnDocument: 'after' })
    res.json(campagne)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── PUT fermer une campagne ───────────────────────────────────
exports.fermerCampagne = async (req, res) => {
  try {
    const campagne = await Campagne.findByIdAndUpdate(req.params.id, { statut: 'fermee', closedAt: new Date() }, { returnDocument: 'after' })
    res.json(campagne)
    setImmediate(() => generateCampaignReport(req.params.id, campagne))
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── GET vérifier campagne + participation ─────────────────────
exports.checkCampagne = async (req, res) => {
  try {
    const now = new Date()
    function localMidnight(d) { const dt = new Date(d); return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0) }
    function localEndOfDay(d) { const dt = new Date(d); return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 23, 59, 59) }
    function formatReste(ms) {
      const j = Math.floor(ms / (1000*60*60*24)), h = Math.floor((ms % (1000*60*60*24)) / (1000*60*60)), m = Math.floor((ms % (1000*60*60)) / (1000*60))
      if (j > 0) return `${j} jour(s) ${h}h ${m}min`
      if (h > 0) return `${h}h ${m}min`
      return `${m} minute(s)`
    }
    const planifiees = await Campagne.find({ statut: 'planifiee' })
    for (const c of planifiees) { if (localMidnight(c.dateDebut) <= now) await Campagne.updateOne({ _id: c._id }, { statut: 'ouverte' }) }
    const ouvertes = await Campagne.find({ statut: 'ouverte' })
    for (const c of ouvertes) { if (localEndOfDay(c.dateFin) < now) await Campagne.updateOne({ _id: c._id }, { statut: 'fermee', closedAt: now }) }
    const campagne = await Campagne.findOne({ statut: 'ouverte' })
    if (!campagne) {
      const prochaine = await Campagne.findOne({ statut: 'planifiee' }).sort({ dateDebut: 1 })
      if (prochaine) {
        const debutLocal = localMidnight(prochaine.dateDebut)
        const dateStr = debutLocal.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        return res.json({ canAudit: false, reason: `La campagne "${prochaine.nom}" ouvrira le ${dateStr} — Il reste ${formatReste(debutLocal - now)}`, dateDebut: prochaine.dateDebut })
      }
      return res.json({ canAudit: false, reason: 'Aucune campagne ouverte' })
    }
    const debutLocal = localMidnight(campagne.dateDebut)
    const finLocal   = localEndOfDay(campagne.dateFin)
    if (now < debutLocal) {
      const dateStr = debutLocal.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      return res.json({ canAudit: false, reason: `La campagne "${campagne.nom}" ouvrira le ${dateStr} — Il reste ${formatReste(debutLocal - now)}`, dateDebut: campagne.dateDebut })
    }
    if (now > finLocal) return res.json({ canAudit: false, reason: `La campagne "${campagne.nom}" est terminée` })
    const existing = await Rapport.findOne({ campagneId: campagne._id, userEmail: decodeURIComponent(req.params.userEmail) })
    if (existing) return res.json({ canAudit: false, reason: 'Vous avez déjà participé à cette campagne', campagne: campagne.nom })
    res.json({ canAudit: true, campagne: campagne.nom, campagneId: campagne._id })
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── GET participants d'une campagne ───────────────────────────
exports.getParticipants = async (req, res) => {
  try {
    const campagneId = req.params.id
    let campagneObjId = null
    try { campagneObjId = new mongoose.Types.ObjectId(campagneId) } catch(e) {}
    const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({ nom: String, email: String, entreprise: String }))
    const users = await User.find({}, 'nom email entreprise').lean()
    const orCamp = campagneObjId
      ? [{ campagneId }, { campagneId: campagneId.toString() }, { campagneId: campagneObjId }]
      : [{ campagneId }, { campagneId: campagneId.toString() }]
    const rapports = await Rapport.find({ $or: orCamp, userEmail: { $not: /^RAPPORT_COLLECTIF_/ } }).lean()
    const Session = mongoose.models.Session || mongoose.model('Session', new mongoose.Schema({ sessionId: String, userEmail: String, userId: String, messages: Array, campagneId: mongoose.Schema.Types.Mixed, score: Number, updatedAt: Date }))
    const sessions = await Session.find({ $or: orCamp }).sort({ updatedAt: -1 }).lean()
    const participants = users.map(user => {
      const email = user.email, userId = user._id?.toString()
      const rapport = rapports.find(r => r.userEmail?.toLowerCase() === email?.toLowerCase() || r.userId === userId)
      if (rapport) return { email, nom: user.nom || email.split('@')[0], entreprise: user.entreprise || '—', statut: 'complete', score: rapport.globalScore || 0, nbReponses: Object.keys(rapport.answers || {}).length, totalQ: 106 }
      const session = sessions.find(s => (s.userId && s.userId === userId) || (s.userEmail && s.userEmail?.toLowerCase() === email?.toLowerCase()))
      if (session) {
        const nb = (session.messages || []).filter(m => m.role === 'user' && m.text?.trim().length > 0).length
        if (nb > 0) return { email, nom: user.nom || email.split('@')[0], entreprise: user.entreprise || '—', statut: 'en_cours', score: null, nbReponses: nb, totalQ: 106 }
      }
      return { email, nom: user.nom || email.split('@')[0], entreprise: user.entreprise || '—', statut: 'pas_encore', score: null, nbReponses: 0, totalQ: 106 }
    })
    participants.sort((a, b) => { const order = { complete: 0, en_cours: 1, pas_encore: 2 }; return order[a.statut] - order[b.statut] })
    res.json(participants)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

module.exports.Campagne = Campagne
module.exports.Rapport  = Rapport