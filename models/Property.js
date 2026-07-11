//models/Property.js
const mongoose = require('mongoose');

const PropertySchema = new mongoose.Schema({
  // Relations
  owner: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Basic Info
  property_type: { 
    type: String, 
    enum: ['Apartment', 'House', 'Condo', 'Land', 'Villa', 'Condominium', 'Commercial'],
    required: true 
  },
  location: { type: String, required: true },
  size_sqm: { type: Number, required: true },
  rooms: { type: Number, required: true },
  price: { type: Number, required: true },
  purpose: { type: String, enum: ['Sale', 'Rent'], required: true },
  description: { type: String }, 

  image_url: { 
    type: String, 
    default: null 
  },
  
  // Workflow Status
  status: { 
    type: String, 
    enum: [
      'Pending', 
      'Available', 
      'Reserved', 
      'Paid 8%',               
      'Paid 20%',               
      'Paid 100%',             
      'Sold', 
      'Leased', 
      'Under Review', 
      'Payment Request Sent', 
      'Final Payment Requested',
      'Awaiting Seller Title', 
      'Seller Signed',         
      'Awaiting Buyer Confirmation', 
      'Buyer Confirmed',       
      'Completed',
      
      // --- ADDED RENTAL WORKFLOW STATUSES ---
      'Awaiting Deposit',      // Matches negotiation transition
      'Rented',                // Final status for rental properties
      'Lease Active'           // Handover complete
    ], 
    default: 'Pending' 
  },

  // Tracks construction progress for payment stages
  structuralMilestone: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 100 
  },
  
  // Selling Requirements
  isCertified: { type: Boolean, default: false }, 
  commission_signed: { type: Boolean, default: false }, 
  
  // Renting Requirements
  advance_months: { 
    type: Number, 
    required: function() { return this.purpose === 'Rent'; },
    max: [2, 'Legal limit for advance payment is 2 months'], 
    default: 1 
  },
  lease_term: { type: Number, default: 24 },

  // --- COMMENTS & RATINGS ---
  comments: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userName: { type: String },
      text: { type: String, required: true },
      rating: { type: Number, required: true, min: 1, max: 5 },
      date: { type: Date, default: Date.now }
    }
  ],
  averageRating: { type: Number, default: 0 }

}, { timestamps: true });

// --- LOGIC GUARDRAILS ---
PropertySchema.pre('save', function(next) {
  // 1. Certification Guardrail: Only for Sales moving to 'Available'
  if (this.purpose === 'Sale' && this.status === 'Available' && !this.isCertified) {
    return next(new Error('Cannot list property as Available without Site Engineer Certification.'));
  }
  
  // 2. Dynamic Average Rating Calculation
  if (this.isModified('comments')) {
    if (this.comments && this.comments.length > 0) {
      const total = this.comments.reduce((acc, item) => (item.rating || 0) + acc, 0);
      this.averageRating = Number((total / this.comments.length).toFixed(1));
    } else {
      this.averageRating = 0;
    }
  }

  next();
});

module.exports = mongoose.model('Property', PropertySchema);