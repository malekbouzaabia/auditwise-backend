const Auditeur  = require('../models/Auditeur')
const Visitor   = require('../models/Visitor')
const bcrypt    = require('bcryptjs')
const jwt       = require('jsonwebtoken')

// ── LOGIN ─────────────────────────────────────────────────────
// Auditeur s'authentifie → reçoit un token JWT
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Admin uniquement via @root (pas dans MongoDB)
    if (email === '@root' && password === '@root') {
      const token = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' })
      return res.json({
        message: 'Connexion admin reussie',
        token,
        redirect: 'dashboard',
        user: { _id: 'admin', nom: 'Admin', prenom: 'Root', email: 'admin@auditwise.com', role: 'admin' }
      })
    }

    const allowedDomains = ['@draexlmaier.com', '@drax.com', '@gmail.com']
    if (!allowedDomains.some(d => email.endsWith(d))) {
      return res.status(403).json({ message: 'Acces reserve aux employes Draexlmaier' })
    }

    // Chercher dans la collection users directement
    const mongoose = require('mongoose')
    const UserCol  = mongoose.connection.collection('users')
    const user     = await UserCol.findOne({ email })
    if (!user) return res.status(400).json({ message: 'Email ou mot de passe incorrect' })

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Compte non active. Verifiez votre email' })
    }

    if (!user.password) {
      return res.status(500).json({ message: 'Erreur compte - contactez administrateur' })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(400).json({ message: 'Email ou mot de passe incorrect' })

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({
      message:  'Connexion reussie',
      token,
      redirect: 'app',
      user: { _id: user._id, nom: user.nom, prenom: user.prenom, email: user.email, entreprise: user.entreprise, role: 'user' }
    })
  } catch (error) {
    console.error('Erreur login:', error.message)
    res.status(500).json({ message: error.message })
  }
}

// ── VERIFY EMAIL ──────────────────────────────────────────────
exports.verifyEmail = async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET)
    const user    = await Auditeur.findOne({ email: decoded.email })
    if (!user) return res.status(404).send('Compte introuvable')
    user.isVerified  = true
    user.verifyToken = null
    await user.save()
    res.send('<html><body style="text-align:center;padding:60px;"><h2>Compte active !</h2></body></html>')
  } catch (err) {
    res.status(400).send('Lien invalide ou expire')
  }
}

// ── GET USERS ─────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const users = await Auditeur.find({}, 'nom email entreprise isVerified createdAt')
    res.json(users)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// ── DELETE USER ───────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const user = await Auditeur.findByIdAndDelete(req.params.id)
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouve' })
    res.json({ message: 'Utilisateur supprime' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// ── UPDATE USER ───────────────────────────────────────────────
exports.updateUser = async (req, res) => {
  try {
    const { nom, email, entreprise } = req.body
    const user = await Auditeur.findByIdAndUpdate(
      req.params.id, { nom, email, entreprise },
      { returnDocument: 'after' }
    )
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouve' })
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}