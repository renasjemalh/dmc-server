// models/Contract.js
const mongoose = require('mongoose');

const SaleContractSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalPrice: { type: Number, required: true },
  reservationFeePaid: { type: Number, required: true }, // 8%-10% [cite: 61]
  paymentSchedule: [{
    milestone: String, // e.g., "Structural Completion" [cite: 21]
    percentage: Number,
    amount: Number,
    isPaid: { type: Boolean, default: false }
  }],
  signatures: {
    sellerSigned: { type: Boolean, default: false },
    buyerSigned: { type: Boolean, default: false }
  },
  status: { type: String, enum: ['Draft', 'Legally Binding', 'Completeded'], default: 'Draft' }
}, { timestamps: true });

const LeaseContractSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  monthlyRent: { type: Number, required: true },
  advanceMonths: { type: Number, max: 2, required: true }, // Mandatory 2-month limit [cite: 81]
  leaseTermMonths: { type: Number, default: 24 }, // Mandatory 2-year term [cite: 111]
  signatures: {
    landlordSigned: { type: Boolean, default: false },
    tenantSigned: { type: Boolean, default: false }
  },
  woredaRegistrationDeadline: Date, // 30-day countdown [cite: 82]
  status: { type: String, enum: ['Draft', 'Active', 'Terminated'], default: 'Draft' }
}, { timestamps: true });

module.exports = {
  SaleContract: mongoose.model('SaleContract', SaleContractSchema),
  LeaseContract: mongoose.model('LeaseContract', LeaseContractSchema)
};