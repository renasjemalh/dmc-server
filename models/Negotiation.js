// models/Negotiation.js
// FIXED: Added titleDocument storage, archivedAt, sellerSignature fields for proper title handover flow

const mongoose = require('mongoose');

const HistoryEventSchema = new mongoose.Schema({
  event:  { type: String, required: true },
  actor:  { type: String, default: 'System' },
  date:   { type: Date, default: Date.now }
}, { _id: false });

const PaymentStageSchema = new mongoose.Schema({
  stage:  { type: Number, required: true },
  pct:    { type: Number, required: true },
  label:  { type: String, required: true },
  paid:   { type: Boolean, default: false },
  paidAt: { type: Date, default: null },
  paidTxRef: { type: String, default: null },   // idempotency token
  engineerConfirmed:   { type: Boolean, default: false },
  engineerConfirmedAt: { type: Date,    default: null  }
}, { _id: false });

const NegotiationSchema = new mongoose.Schema({
  property:      { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  buyer:         { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  seller:        { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  proposedPrice: { type: Number, required: true },
  message:       { type: String },

  // ---- Agreement flags ----
  buyerAgreed:   { type: Boolean, default: false },
  sellerAgreed:  { type: Boolean, default: false },

  // ---- Dynamic payment schedule ----
  paymentSchedule: [PaymentStageSchema],
  currentStage:    { type: Number, default: 0 },

  // ---- Running totals ----
  reservationFee: { type: Number, default: 0 },
  amountPaid:     { type: Number, default: 0 },

  // ---- Rental fields ----
  advanceMonths:   { type: Number, default: 0 },
  securityDeposit: { type: Number, default: 0 },

  // ---- Terms modification request ----
  termsModificationRequest: {
    requestedBy:            { type: String, default: null },
    reason:                 { type: String, default: null },
    otherPartyResponse:     { type: String, default: null },
    otherPartyRespondedBy:  { type: String, default: null },
    otherPartyResponseDate: { type: Date },
    adminNotes:             { type: String, default: null },
    customTerms:            { type: String, default: null },
    date:                   { type: Date },
    revisedAt:              { type: Date }
  },

  // ---- Title document (FIXED: richer title tracking) ----
  titleFile:          { type: String, default: null },  // base64 or file path from seller
  sellerSignature:    { type: String, default: null },  // seller's digital signature name
  sellerSignedAt:     { type: Date,   default: null },
  buyerSignature:     { type: String, default: null },  // buyer's digital signature name
  buyerSignedAt:      { type: Date,   default: null },

  // ---- Archive ----
  // Populated when deal reaches "Completed"
  archivedAt:         { type: Date,   default: null },
  archiveData: {
    propertyLocation:  { type: String, default: null },
    propertyType:      { type: String, default: null },
    finalPrice:        { type: Number, default: null },
    buyerName:         { type: String, default: null },
    buyerEmail:        { type: String, default: null },
    sellerName:        { type: String, default: null },
    sellerEmail:       { type: String, default: null },
    completedAt:       { type: Date,   default: null },
    titleFile:         { type: String, default: null },
    sellerSignature:   { type: String, default: null },
    buyerSignature:    { type: String, default: null },
    paymentSchedule:   { type: Array,  default: []   },
    totalPaid:         { type: Number, default: null },
  },

  // ---- Status ----
  status: {
    type: String,
    enum: [
      'Pending', 'Approved by Admin', 'Negotiation Pending', 'Price Agreed',
      'Terms Sent', 'Parties Agreed',
      'Stage 1 Payment Requested', 'Stage 1 Paid',
      'Stage 2 Payment Requested', 'Stage 2 Paid',
      'Stage 3 Payment Requested', 'Stage 3 Paid',
      'Stage 4 Payment Requested', 'Stage 4 Paid',
      'Reserved',
      // FIXED: Full payment done — admin must manually trigger title request
      'Full Payment Received',
      'Awaiting Seller Title', 'Seller Signed',
      'Awaiting Buyer Confirmation', 'Buyer Confirmed',
      'Completed',
      'Awaiting Deposit', 'Deposit Paid', 'Lease Active', 'Rented',
      // Legacy
      'Paid 10%', 'Paid 40%', 'Paid 50%', 'Paid 100%',
      '40% Payment Requested', '50% Payment Requested',
      'Final Payment Requested', 'Paid 8%', 'Paid 20%',
      'Rejected', 'Counter Offered', 'Price Agreed by Buyer',
      'Terms Modification Requested', 'Terms Modification Reviewed', 'Terms Revised'
    ],
    default: 'Pending'
  },

  history: [HistoryEventSchema],
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Negotiation', NegotiationSchema);