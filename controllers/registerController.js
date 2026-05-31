const Auditeur   = require('../models/Auditeur')
const bcrypt     = require('bcryptjs')
const nodemailer = require('nodemailer')

// ── Stockage temporaire avant vérification ───────────────────
const pendingUsers = new Map()

setInterval(() => {
  const now = new Date()
  for (const [email, data] of pendingUsers.entries()) {
    if (now > data.mfaExpires) {
      pendingUsers.delete(email)
      console.log('🧹 Suppression inscription expiree:', email)
    }
  }
}, 15 * 60 * 1000)

// ── Transporter Email ─────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:    587,
  secure:  false,
  auth: {
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
  },
  tls: { rejectUnauthorized: false, servername: 'smtp.gmail.com' },
  family: 4,
})

async function sendEmail(to, subject, html) {
  try {
    console.log('📧 Envoi email a:', to)
    await transporter.sendMail({
      from: `"AuditWise" <${process.env.MAIL_USER}>`,
      to, subject, html,
    })
    console.log('✅ Email envoye avec succes a:', to)
  } catch (err) {
    console.error('❌ Erreur envoi email:', err.message)
    throw err
  }
}

// ── REGISTER ──────────────────────────────────────────────────
// Visiteur s'inscrit → données stockées en mémoire (pendingUsers)
// Pas encore dans MongoDB → attend vérification MFA
exports.register = async (req, res) => {
  try {
    const { nom, email, password, entreprise } = req.body

    const allowedDomains = ['@draexlmaier.com', '@drax.com', '@gmail.com']
    if (!allowedDomains.some(d => email.endsWith(d))) {
      return res.status(403).json({ message: 'Acces reserve aux employes Draexlmaier' })
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()\-_=+{};:,<.>]).{8,}$/
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: 'Le mot de passe doit contenir au moins 8 caracteres, une majuscule, un chiffre et un caractere special'
      })
    }

    const userExists = await Auditeur.findOne({ email })
    if (userExists && userExists.isVerified) {
      return res.status(400).json({ message: 'Utilisateur deja existant' })
    }

    const mfaCode    = Math.floor(100000 + Math.random() * 900000).toString()
    const mfaExpires = new Date(Date.now() + 10 * 60 * 1000)

    await sendEmail(email, 'Code de verification AuditWise', `
      <div style="font-family:Arial; max-width:500px; margin:0 auto;">
        <div style="background:linear-gradient(135deg,#0b1f45,#1b6fd8); padding:30px; border-radius:12px 12px 0 0; text-align:center;">
          <h1 style="color:white; margin:0;">AuditWise</h1>
        </div>
        <div style="background:white; padding:30px; border:1px solid #e0eaff; border-radius:0 0 12px 12px; text-align:center;">
          <h2 style="color:#0b1f45;">Bonjour ${nom || email.split('@')[0]},</h2>
          <p style="color:#6b8cba;">Votre code de verification :</p>
          <div style="background:#f0f6ff; border-radius:14px; padding:24px; margin:20px 0; border:2px solid #1b6fd8;">
            <span style="font-size:44px; font-weight:800; color:#1b6fd8; letter-spacing:10px;">${mfaCode}</span>
          </div>
          <p style="color:#94a3b8; font-size:12px;">Expire dans 10 minutes.</p>
        </div>
      </div>
    `)

    const salt           = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Visiteur stocké temporairement en mémoire (pas dans MongoDB)
    pendingUsers.set(email, {
      nom, email, entreprise,
      password: hashedPassword,
      mfaCode, mfaExpires,
      createdAt: new Date()
    })

    console.log('Visiteur en attente de verification:', email)
    res.status(201).json({
      message: 'Code envoye ! Entrez le code recu par email pour activer votre compte.',
      requireCode: true,
      email
    })
  } catch (error) {
    console.error('Erreur register:', error.message)
    res.status(500).json({ message: error.message })
  }
}

// ── VERIFY MFA ────────────────────────────────────────────────
// Après vérification MFA → Visiteur devient Auditeur dans MongoDB
exports.verifyMFA = async (req, res) => {
  try {
    const { email, code } = req.body

    const pending = pendingUsers.get(email)
    if (!pending) return res.status(404).json({ message: 'Aucune inscription en attente pour cet email' })
    if (pending.mfaCode !== code) return res.status(401).json({ message: 'Code incorrect' })
    if (new Date() > pending.mfaExpires) {
      pendingUsers.delete(email)
      return res.status(401).json({ message: 'Code expire - veuillez vous reinscrire' })
    }

    // Visiteur → Auditeur (sauvegardé dans MongoDB avec role: 'user')
    await Auditeur.create({
      nom:        pending.nom,
      email:      pending.email,
      entreprise: pending.entreprise || '',
      password:   pending.password,
      isVerified: true,
      mfaCode:    null,
      mfaExpires: null,
    })

    pendingUsers.delete(email)
    console.log('Auditeur cree dans MongoDB:', email)
    res.json({ message: 'Compte active avec succes ! Vous pouvez maintenant vous connecter.' })
  } catch (error) {
    console.error('Erreur verifyMFA:', error.message)
    res.status(500).json({ message: error.message })
  }
}