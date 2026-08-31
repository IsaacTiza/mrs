const express = require('express');
const { registerInvigilator, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerInvigilator);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
