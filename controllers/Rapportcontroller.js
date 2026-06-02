const mongoose   = require('mongoose')

const axios = require('axios')
// ── Récupérer Rapport depuis campagneController ───────────────
const { Rapport } = require('./Campagnecontroller')

// ── NodeMailer ────────────────────────────────────────────────

async function sendEmail(auditeurEmail, userEmail, globalScore, htmlBody, pdfBase64) {
  await axios.post(
    'https://api.mailjet.com/v3.1/send',
    {
      Messages: [{
        From: {
          Email: process.env.MAIL_USER,
          Name: 'AuditWise'
        },
        To: [{
          Email: auditeurEmail
        }],
        Subject: `Rapport Audit ISO 27001 — ${userEmail} — Score: ${globalScore}%`,
        HTMLPart: htmlBody
      }]
    },
    {
      auth: {
        username: process.env.MAILJET_API_KEY,
        password: process.env.MAILJET_SECRET_KEY
      }
    }
  )
}
// ── POST sauvegarder un rapport ───────────────────────────────
exports.saveRapport = async (req, res) => {
  try {
    const { userId, userEmail, globalScore, domainScores, domainsData, answers, campagneId, campagneNom } = req.body
    const rapport = await Rapport.create({
      userId, userEmail, globalScore,
      domainScores: domainScores || {}, domainsData: domainsData || [], answers: answers || {},
      campagneId: campagneId || null, campagneNom: campagneNom || null,
      statut: globalScore >= 70 ? 'conforme' : globalScore >= 40 ? 'partiel' : 'non-conforme',
      createdAt: new Date()
    })
    res.json(rapport)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── GET liste des rapports ────────────────────────────────────
exports.getRapports = async (req, res) => {
  try {
    const rapports = await Rapport.find().sort({ createdAt: -1 }).lean()
    res.json(rapports)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── DELETE vider les rapports ─────────────────────────────────
exports.clearRapports = async (req, res) => {
  try {
    await Rapport.deleteMany({})
    res.json({ message: 'Rapports supprimés' })
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// ── DELETE supprimer un rapport par ID ───────────────────────
exports.deleteRapport = async (req, res) => {
  try {
    const rapport = await Rapport.findByIdAndDelete(req.params.id)
    if (!rapport) return res.status(404).json({ error: 'Rapport introuvable' })
    res.json({ message: 'Rapport supprimé' })
  } catch (e) { res.status(500).json({ error: e.message }) }
}


// ── POST envoyer rapport par email ────────────────────────────
exports.sendEmail = async (req, res) => {
  try {
    const { userEmail, globalScore, domainScores, pdfBase64, domainsData } = req.body
    const auditeurEmail = process.env.AUDITEUR_EMAIL || process.env.ADMIN_EMAIL
    if (!auditeurEmail) return res.status(400).json({ error: 'Email non configuré' })
    const statut = globalScore >= 70 ? 'Conforme' : globalScore >= 40 ? 'Partiellement conforme' : 'Non-conforme'
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#0b1f45,#1b6fd8);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:white;margin:0;">AuditWise</h1>
          <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;">Rapport Audit ISO 27001:2022</p>
        </div>
        <div style="background:white;padding:30px;border:1px solid #e0eaff;border-radius:0 0 12px 12px;">
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr style="background:#f0f6ff;"><td style="padding:12px;font-weight:bold;">Utilisateur</td><td style="padding:12px;color:#1b6fd8;">${userEmail || 'Anonyme'}</td></tr>
            <tr><td style="padding:12px;font-weight:bold;">Score global</td><td style="padding:12px;font-size:20px;font-weight:bold;color:${globalScore >= 70 ? '#22c55e' : globalScore >= 40 ? '#f59e0b' : '#ef4444'};">${globalScore}%</td></tr>
            <tr style="background:#f0f6ff;"><td style="padding:12px;font-weight:bold;">Statut</td><td style="padding:12px;">${statut}</td></tr>
          </table>
          <p style="color:#94a3b8;font-size:11px;text-align:center;">Généré par AuditWise AI — ISO 27001:2022</p>
        </div>
      </div>`
       await sendEmail(
      auditeurEmail,
      userEmail,
      globalScore,
      htmlBody,
      pdfBase64
    )
    
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// ── POST réclamations IA via RAG ──────────────────────────────
exports.reclamations = async (req, res) => {
  try {
    const { domains, answers } = req.body
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY manquante' })
    const { getClauseFromDocument } = require('./chatController')
    const reclamations = {}
    for (const [key, answer] of Object.entries(answers)) {
      const isFaux    = answer === false || answer === 'false' || answer === 0
      const isPartiel = answer === 'partial'
      if (!isFaux && !isPartiel) continue
      const [domIdx, qIdx] = key.split('-').map(Number)
      const domain   = domains[domIdx]
      const question = domain?.questions?.[qIdx] || null
      const clause   = domain?.clause
      if (!domain || !clause) continue
      if (!question) { reclamations[key] = 'Mettre en conformite avec la clause ' + clause + ' de la norme ISO 27001:2022.'; continue }
      const clauseDoc = getClauseFromDocument(clause)
      if (!clauseDoc) continue
      const type   = answer === 'partial' ? 'partiellement conforme' : 'non conforme'
      const prompt = `Question d'audit ISO 27001:2022 : "${question}"\nRéponse : ${type}\nClause ${clause} : "${clauseDoc.snippet.slice(0, 300)}"\nGénère UNE réclamation courte (2 lignes max). Commence par un verbe d'action.`
      try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 100, temperature: 0.3 }),
        })
        const data = await response.json()
        const text = data.choices?.[0]?.message?.content?.trim()
        if (text) reclamations[key] = text
      } catch (e) {
        reclamations[key] = 'Mettre en conformite avec la clause ' + clause + ' de la norme ISO 27001:2022.'
      }
      await new Promise(r => setTimeout(r, 300))
    }
    res.json({ reclamations })
  } catch (err) { res.status(500).json({ error: err.message }) }
}