const express = require('express')
const router  = express.Router()

// ── Controllers séparés ───────────────────────────────────────
const { register, verifyMFA } = require('../controllers/registerController')
const { login, verifyEmail, getUsers, deleteUser, updateUser } = require('../controllers/authController')

// ── Routes Inscription (registerController) ───────────────────
router.post('/register',   register)
router.post('/verify-mfa', verifyMFA)

// ── Routes Authentification (authController) ──────────────────
router.post('/login',       login)
router.get('/verify/:token', verifyEmail)

// ── Routes Gestion Utilisateurs (authController) ──────────────
router.get('/users',        getUsers)
router.delete('/users/:id', deleteUser)
router.put('/users/:id',    updateUser)

module.exports = router