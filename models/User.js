//models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  full_name: { 
    type: String, 
    required: true 
  }, 
  email: { 
    type: String, 
    unique: true, 
    required: true 
  }, 
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['Owner', 'Buyer', 'Tenant', 'Engineer', 'Admin', 'Bank'], 
    required: true 
  }, 
  phone: { 
    type: String 
  },
  national_id: { 
    type: String, 
    required: true 
  }, 
  status: { 
    type: String, 
    default: 'Active' 
  },
  // --- NEW FIELD FOR WISHLIST ---
  favorites: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property'
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);