//routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// @route   POST api/auth/register
// @desc    Register a user (used by public & Admin Dashboard)
router.post('/register', async (req, res) => {
  const { full_name, email, password, role, phone, national_id } = req.body;

  try {
    // 1. Validation
    if (!password || typeof password !== 'string') {
        return res.status(400).json({ msg: 'Password is required' });
    }

    if (!email || !full_name) {
        return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    // 2. Check if user exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists with this email' });

    // 3. Create instance
    user = new User({ 
        full_name, 
        email, 
        password, 
        role: role || 'Buyer', 
        phone, 
        national_id 
    });

    // 4. Hash Password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(String(password), salt);

    // 5. Save to MongoDB
    await user.save();

    // 6. Generate Token
    const payload = { user: { id: user.id, role: user.role } };
    const secret = process.env.JWT_SECRET || 'dmc_secret_key_123';

    jwt.sign(payload, secret, { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      res.json({ 
        token, 
        user: { id: user.id, role: user.role, name: user.full_name } 
      });
    });

  } catch (err) {
    console.error("Registration Error:", err.message);
    res.status(500).json({ msg: 'Server error: ' + err.message });
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
        return res.status(400).json({ msg: 'Please enter all fields' });
    }

    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

    // Secure Compare: Check if password exists in DB first
    if (!user.password) {
        return res.status(400).json({ msg: 'Account data corrupted. Contact Admin.' });
    }

    const isMatch = await bcrypt.compare(String(password), String(user.password));
    if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

    const payload = { user: { id: user.id, role: user.role } };
    const secret = process.env.JWT_SECRET || 'dmc_secret_key_123';

    jwt.sign(payload, secret, { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      res.json({ 
        token, 
        user: { id: user.id, role: user.role, name: user.full_name } 
      });
    });

  } catch (err) {
    console.error("Login Error:", err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;