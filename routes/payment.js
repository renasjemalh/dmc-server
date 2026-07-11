// routes/payment.js
// FIX: When all stages paid, status → 'Paid 100%' (NOT 'Awaiting Seller Title').
//      Admin must manually click "Request Seller Title" to start the title handover.
//      The GET /verify/:tx_ref route is the ONLY place that marks stages paid.
//      The PUT /verify-payment/:id route only refreshes data (no stage marking).

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { auth } = require('../middleware/auth');
const Negotiation = require('../models/Negotiation');
const Property    = require('../models/Property');

/**
 * @route  POST /api/payment/initialize/:id
 * @desc   Initialize a Chapa payment for the NEXT unpaid stage in the schedule
 */
router.post('/initialize/:id', auth, async (req, res) => {
  try {
    const { isRentalDeposit } = req.body;
    const negotiation = await Negotiation.findById(req.params.id).populate('buyer property');
    if (!negotiation) return res.status(404).json({ msg: 'Negotiation not found' });

    const price = negotiation.proposedPrice;
    let amount  = 0;
    let typeKey = 'r';
    let title   = '';

    // ── Rental path ──
    if (isRentalDeposit || negotiation.property?.purpose === 'Rent') {
      typeKey = 'l';
      title   = 'Security Deposit & Advance Rent';
      const deposit   = negotiation.securityDeposit !== undefined
                          ? negotiation.securityDeposit
                          : (negotiation.property.securityDeposit || 0);
      const advMonths = negotiation.advanceMonths !== undefined
                          ? negotiation.advanceMonths
                          : (negotiation.property.advance_months || 0);
      const monthly   = price || negotiation.property.price;
      amount = deposit + (monthly * advMonths);
      if (amount <= 0)
        return res.status(400).json({ msg: 'Calculated rental amount is 0. Contact Admin.' });

    } else {
      // ── Sale path: derive amount from paymentSchedule ──
      const schedule = negotiation.paymentSchedule;
      if (!schedule || schedule.length === 0)
        return res.status(400).json({ msg: 'No payment schedule set. Admin must send terms first.' });

      const nextStage = schedule.find(s => !s.paid);
      if (!nextStage)
        return res.status(400).json({ msg: 'All payment stages already completed.' });

      amount  = price * (nextStage.pct / 100);
      title   = `${nextStage.label} — ${nextStage.pct}% = ${amount.toLocaleString()} ETB`;

      const isFirst = nextStage.stage === 1;
      const isLast  = nextStage.stage === schedule.length;
      typeKey = isFirst ? 'r' : isLast ? 'f' : `m${nextStage.stage}`;
    }

    const tx_ref = `${typeKey}-${negotiation._id}-${Date.now()}`;

    const chapaData = {
      amount:       amount.toFixed(2).toString(),
      currency:     'ETB',
      email:        negotiation.buyer.email,
      first_name:   negotiation.buyer.full_name?.split(' ')[0] || 'Client',
      last_name:    negotiation.buyer.full_name?.split(' ')[1] || 'User',
      tx_ref,
      callback_url: `https://webhook.site/your-unique-id`, // Replace in production
      return_url:   `http://localhost:5000/api/payment/verify/${tx_ref}`,
      'customization[title]':       title,
      'customization[description]': `${title} for property at ${negotiation.property?.location}`
    };

    const response = await axios.post(
      'https://api.chapa.co/v1/transaction/initialize',
      chapaData,
      {
        headers: {
          Authorization:  `Bearer ${process.env.CHAPA_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === 'success') {
      res.json({ checkout_url: response.data.data.checkout_url });
    } else {
      res.status(400).json({ msg: 'Chapa failed to initialize' });
    }
  } catch (err) {
    console.error('Chapa Init Error:', err.response?.data || err.message);
    res.status(500).send('Payment initialization failed');
  }
});

/**
 * @route  GET /api/payment/verify/:tx_ref
 * @desc   Chapa redirect after payment — THIS IS THE ONLY PLACE stages get marked paid.
 *         FIX: When ALL stages paid → status = 'Paid 100%' (not 'Awaiting Seller Title').
 *              Admin must manually trigger title handover from the dashboard.
 */
router.get('/verify/:tx_ref', async (req, res) => {
  const { tx_ref } = req.params;
  try {
    const response = await axios.get(
      `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
      { headers: { Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}` } }
    );

    const paymentSuccess =
      response.data.status === 'success' ||
      response.data.data?.status === 'success';

    if (!paymentSuccess)
      return res.redirect(`http://localhost:3000/my-negotiations?payment=failed`);

    // Parse tx_ref: typeKey-negotiationId-timestamp
    const parts         = tx_ref.split('-');
    const typeKey       = parts[0];
    const negotiationId = parts[1];

    const negotiation = await Negotiation.findById(negotiationId).populate('property');
    if (!negotiation)
      return res.redirect(`http://localhost:3000/my-negotiations?payment=failed`);

    // Idempotency guard — prevent double-processing if Chapa calls this twice
    const alreadyProcessed = (negotiation.paymentSchedule || []).some(
      s => s.paidTxRef === tx_ref
    );
    if (alreadyProcessed) {
      console.log(`tx_ref ${tx_ref} already processed — skipping.`);
      return res.redirect(
        `http://localhost:3000/my-negotiations?payment=success&id=${negotiationId}`
      );
    }

    const price = negotiation.proposedPrice;

    // ── Rental ──
    if (typeKey === 'l') {
      negotiation.status      = 'Deposit Paid';
      negotiation.buyerAgreed = true;
      negotiation.history.push({
        event: 'Rental deposit & advance verified via Chapa.',
        actor: 'System (Chapa)',
        date:  new Date()
      });
      await Property.findByIdAndUpdate(negotiation.property._id, { status: 'Rented' });
      await negotiation.save();

      return res.redirect(
        `http://localhost:3000/my-negotiations?payment=success&id=${negotiationId}&rental=true`
      );
    }

    // ── Sale: mark ONLY the next unpaid stage paid ──
    const schedule  = negotiation.paymentSchedule || [];
    const nextStage = schedule.find(s => !s.paid);

    if (!nextStage) {
      // All stages already paid — just redirect cleanly
      return res.redirect(
        `http://localhost:3000/my-negotiations?payment=success&id=${negotiationId}`
      );
    }

    const stageAmount          = price * (nextStage.pct / 100);
    negotiation.amountPaid     = (negotiation.amountPaid || 0) + stageAmount;
    nextStage.paid             = true;
    nextStage.paidAt           = new Date();
    nextStage.paidTxRef        = tx_ref; // idempotency token
    negotiation.currentStage   = nextStage.stage;
    negotiation.buyerAgreed    = true;

    const allPaid = schedule.every(s => s.paid);

    // ── FIX: Full payment done → 'Paid 100%', NOT 'Awaiting Seller Title' ──
    // Admin must manually click "Request Seller Title" to proceed.
    negotiation.status = allPaid
      ? 'Paid 100%'
      : `Stage ${nextStage.stage} Paid`;

    negotiation.history.push({
      event: `Stage ${nextStage.stage} "${nextStage.label}" (${nextStage.pct}%) payment verified via Chapa. Status → ${negotiation.status}.`,
      actor: 'System (Chapa)',
      date:  new Date()
    });

    // Property status updates
    if (allPaid) {
      // Mark property as fully paid — admin will update to Awaiting Seller Title manually
      await Property.findByIdAndUpdate(negotiation.property._id, {
        structuralMilestone: 100
      });
    } else if (nextStage.stage === 1) {
      // After reservation payment, admin must verify first — don't change property status
    } else {
      const confirmedPct = Math.round((negotiation.amountPaid / price) * 100);
      await Property.findByIdAndUpdate(negotiation.property._id, {
        structuralMilestone: confirmedPct
      });
    }

    await negotiation.save();

    return res.redirect(
      `http://localhost:3000/my-negotiations?payment=success&id=${negotiationId}`
    );

  } catch (err) {
    console.error('Chapa Verify Error:', err.message);
    return res.redirect(`http://localhost:3000/my-negotiations?payment=failed`);
  }
});

/**
 * @route  PUT /api/payment/verify-payment/:id   (called by frontend after redirect)
 * @desc   NO LONGER marks any stage paid — that already happened in GET /verify.
 *         This route now only returns the latest negotiation data for frontend refresh.
 */
router.put('/verify-payment/:id', auth, async (req, res) => {
  try {
    const neg = await Negotiation.findById(req.params.id)
      .populate('property')
      .populate('buyer',  'full_name email')
      .populate('seller', 'full_name email');

    if (!neg) return res.status(404).json({ msg: 'Negotiation not found' });

    // Just return latest state — no mutations
    res.json({ msg: 'Payment already verified.', negotiation: neg });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;