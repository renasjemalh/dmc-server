// routes/negotiations.js
// KEY CHANGES:
//   - GET /archive  returns status 'Completed' deals with full buyer/seller/property detail
//   - PUT /notify-next-stage/:id  gated behind engineer confirmation (unchanged)
//   - PUT /report-stage/:id       engineer confirms last paid stage (unchanged)
//   - PUT /reserve/:id            admin verifies first payment (unchanged)
//   - PUT /:id  general status update — when status → 'Completed', property marked Sold (unchanged)
//   - All other existing routes preserved exactly

const express    = require('express');
const router     = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const Negotiation = require('../models/Negotiation');
const Property    = require('../models/Property');
const User        = require('../models/User');

// ─────────────────────────────────────────────
// GET  /api/negotiations/admin
// ─────────────────────────────────────────────
router.get('/admin', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const negotiations = await Negotiation.find()
      .populate('property')
      .populate('buyer',  'full_name email')
      .populate('seller', 'full_name email')
      .sort({ date: -1 });
    res.json(negotiations);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// GET  /api/negotiations/archive
// Returns all Completed deals with full details for the admin archive page.
// FIX: also sorts by updatedAt descending so most recently closed deals appear first,
//      and populates national_id for potential audit display.
// ─────────────────────────────────────────────
router.get('/archive', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const archived = await Negotiation.find({ status: 'Completed' })
      .populate('property')
      .populate('buyer',  'full_name email national_id')
      .populate('seller', 'full_name email national_id')
      .sort({ updatedAt: -1, date: -1 });   // most recently completed first
    res.json(archived);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// GET  /api/negotiations/my-offers
// ─────────────────────────────────────────────
router.get('/my-offers', auth, async (req, res) => {
  try {
    const offers = await Negotiation.find({ buyer: req.user.id })
      .populate('property')
      .populate('seller', 'full_name email')
      .sort({ date: -1 });
    res.json(offers);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// GET  /api/negotiations/seller
// ─────────────────────────────────────────────
router.get('/seller', auth, async (req, res) => {
  try {
    const offers = await Negotiation.find({ seller: req.user.id })
      .populate('property')
      .populate('buyer', 'full_name email')
      .sort({ date: -1 });
    res.json(offers);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// GET  /api/negotiations/engineer-tasks
// ─────────────────────────────────────────────
router.get('/engineer-tasks', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    const tasks = await Negotiation.find({
      status: {
        $in: [
          'Reserved',
          'Stage 1 Paid',
          'Stage 2 Payment Requested', 'Stage 2 Paid',
          'Stage 3 Payment Requested', 'Stage 3 Paid',
          'Stage 4 Payment Requested', 'Stage 4 Paid',
          'Paid 10%', 'Paid 40%', '40% Payment Requested'
        ]
      }
    })
      .populate('property')
      .populate('buyer',  'full_name email')
      .populate('seller', 'full_name email')
      .sort({ date: -1 });

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// GET  /api/negotiations/history/:id
// ─────────────────────────────────────────────
router.get('/history/:id', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const neg = await Negotiation.findById(req.params.id);
    if (!neg) return res.status(404).json({ msg: 'Negotiation not found' });
    res.json({ history: neg.history });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// POST /api/negotiations
// ─────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { property_id, proposedPrice, message, seller, status } = req.body;
    const negotiation = new Negotiation({
      property:      property_id,
      buyer:         req.user.id,
      seller,
      proposedPrice: Number(proposedPrice),
      message,
      status:        status || 'Pending',
      history: [{
        event: `Buyer submitted offer of ${Number(proposedPrice).toLocaleString()} ETB.`,
        actor: 'Buyer',
        date:  new Date()
      }]
    });
    await negotiation.save();
    res.status(201).json(negotiation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server Error: ' + err.message });
  }
});

// ─────────────────────────────────────────────
// PUT  /api/negotiations/report-stage/:id
// Engineer confirms last paid stage
// ─────────────────────────────────────────────
router.put('/report-stage/:id', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    const neg = await Negotiation.findById(req.params.id).populate('property');
    if (!neg) return res.status(404).json({ msg: 'Negotiation not found' });

    const schedule = neg.paymentSchedule || [];

    const stageToConfirm = [...schedule].reverse().find(
      s => s.paid && !s.engineerConfirmed
    );
    if (!stageToConfirm) {
      return res.status(400).json({
        msg: 'No paid stage awaiting engineer confirmation, or all stages already confirmed.'
      });
    }

    stageToConfirm.engineerConfirmed   = true;
    stageToConfirm.engineerConfirmedAt = new Date();

    const confirmedPct = schedule
      .filter(s => s.paid && s.engineerConfirmed)
      .reduce((sum, s) => sum + s.pct, 0);

    await Property.findByIdAndUpdate(neg.property._id, {
      structuralMilestone: confirmedPct
    });

    neg.history.push({
      event: `Engineer confirmed Stage ${stageToConfirm.stage} "${stageToConfirm.label}" (${stageToConfirm.pct}%) work complete. Admin can now notify buyer for next payment.`,
      actor: 'Engineer',
      date:  new Date()
    });

    await neg.save();

    res.json({
      msg: `Stage ${stageToConfirm.stage} "${stageToConfirm.label}" confirmed. Admin can now notify the buyer for the next payment.`,
      stage: stageToConfirm
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// PUT  /api/negotiations/reserve/:id
// Admin verifies first payment and marks Reserved
// ─────────────────────────────────────────────
router.put('/reserve/:id', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const neg = await Negotiation.findById(req.params.id).populate('property');
    if (!neg) return res.status(404).json({ msg: 'Negotiation not found' });

    neg.status = 'Reserved';
    neg.history.push({
      event: 'Admin verified first payment. Property marked as Reserved.',
      actor: 'Admin',
      date:  new Date()
    });

    await Property.findByIdAndUpdate(neg.property._id, { status: 'Reserved' });
    await neg.save();

    res.json({ msg: 'Property reserved successfully.', negotiation: neg });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// PUT  /api/negotiations/notify-next-stage/:id
// Admin notifies buyer to pay next stage.
// GUARD: engineer must have confirmed the last paid stage first.
// ─────────────────────────────────────────────
router.put('/notify-next-stage/:id', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const neg = await Negotiation.findById(req.params.id).populate('property buyer');
    if (!neg) return res.status(404).json({ msg: 'Negotiation not found' });

    const schedule = neg.paymentSchedule || [];

    // Guard: engineer must have confirmed last paid stage
    const lastPaidStage = [...schedule].reverse().find(s => s.paid);
    if (lastPaidStage && !lastPaidStage.engineerConfirmed) {
      return res.status(403).json({
        msg: 'Cannot notify buyer yet. The engineer must first confirm construction progress for the last paid stage.'
      });
    }

    const nextStage = schedule.find(s => !s.paid);
    if (!nextStage) {
      return res.status(400).json({ msg: 'All payment stages are already paid.' });
    }

    neg.status = `Stage ${nextStage.stage} Payment Requested`;
    neg.history.push({
      event: `Admin requested Stage ${nextStage.stage} "${nextStage.label}" payment (${nextStage.pct}%) from buyer.`,
      actor: 'Admin',
      date:  new Date()
    });

    await neg.save();
    res.json({
      msg: `Buyer notified for Stage ${nextStage.stage} "${nextStage.label}" payment.`,
      negotiation: neg
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// PUT  /api/negotiations/verify-payment/:id
// Safe "refresh" endpoint — no mutations.
// ─────────────────────────────────────────────
router.put('/verify-payment/:id', auth, async (req, res) => {
  try {
    const neg = await Negotiation.findById(req.params.id)
      .populate('property')
      .populate('buyer',  'full_name email')
      .populate('seller', 'full_name email');

    if (!neg) return res.status(404).json({ msg: 'Negotiation not found' });

    res.json({ msg: 'Payment already processed.', negotiation: neg });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ─────────────────────────────────────────────
// Legacy routes (backward compat)
// ─────────────────────────────────────────────
router.put('/report-40/:id', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    const neg = await Negotiation.findById(req.params.id).populate('property');
    if (!neg) return res.status(404).json({ msg: 'Not found' });
    const stage = [...(neg.paymentSchedule || [])].reverse().find(s => s.paid && !s.engineerConfirmed);
    if (stage) {
      stage.engineerConfirmed   = true;
      stage.engineerConfirmedAt = new Date();
      neg.history.push({ event: `Engineer confirmed 40% milestone (legacy route).`, actor: 'Engineer', date: new Date() });
      await Property.findByIdAndUpdate(neg.property._id, { structuralMilestone: 40 });
      await neg.save();
    }
    res.json({ msg: '40% milestone confirmed.' });
  } catch (err) { res.status(500).send('Server Error'); }
});

router.put('/report-100/:id', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    const neg = await Negotiation.findById(req.params.id).populate('property');
    if (!neg) return res.status(404).json({ msg: 'Not found' });
    const stage = [...(neg.paymentSchedule || [])].reverse().find(s => s.paid && !s.engineerConfirmed);
    if (stage) {
      stage.engineerConfirmed   = true;
      stage.engineerConfirmedAt = new Date();
      neg.history.push({ event: `Engineer confirmed 100% completion (legacy route).`, actor: 'Engineer', date: new Date() });
      await Property.findByIdAndUpdate(neg.property._id, { structuralMilestone: 100 });
      await neg.save();
    }
    res.json({ msg: '100% completion confirmed.' });
  } catch (err) { res.status(500).send('Server Error'); }
});

// ─────────────────────────────────────────────
// PUT  /api/negotiations/:id  (general status update)
// ─────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      status, buyerAgreed, sellerAgreed, proposedPrice, message,
      titleFile, paymentSchedule, customTerms, adminNotes,
      otherPartyResponse, reason
    } = req.body;

    const neg = await Negotiation.findById(req.params.id);
    if (!neg) return res.status(404).json({ msg: 'Negotiation not found' });

    if (status)          neg.status        = status;
    if (proposedPrice)   neg.proposedPrice = Number(proposedPrice);
    if (message)         neg.message       = message;
    if (titleFile)       neg.titleFile     = titleFile;
    if (paymentSchedule) neg.paymentSchedule = paymentSchedule;

    if (buyerAgreed  !== undefined) neg.buyerAgreed  = buyerAgreed;
    if (sellerAgreed !== undefined) neg.sellerAgreed = sellerAgreed;

    // When status changes to Completed, mark property as Sold
    if (status === 'Completed') {
      await Property.findByIdAndUpdate(neg.property, { status: 'Sold' });
    }

    if (status === 'Terms Modification Requested' && reason) {
      const requestedBy = req.body.requestedBy ||
        (req.user.role === 'Buyer' || req.user.role === 'Tenant' ? 'Buyer' : 'Seller');
      neg.termsModificationRequest = {
        requestedBy,
        reason,
        date: new Date(),
        otherPartyResponse:    null,
        otherPartyRespondedBy: null,
        customTerms:           neg.termsModificationRequest?.customTerms || null,
        adminNotes:            neg.termsModificationRequest?.adminNotes  || null,
      };
    }

    if (status === 'Terms Modification Reviewed' && otherPartyResponse) {
      const respondedBy = req.user.role === 'Buyer' || req.user.role === 'Tenant' ? 'Buyer' : 'Seller';
      if (neg.termsModificationRequest) {
        neg.termsModificationRequest.otherPartyResponse     = otherPartyResponse;
        neg.termsModificationRequest.otherPartyRespondedBy  = respondedBy;
        neg.termsModificationRequest.otherPartyResponseDate = new Date();
      }
    }

    if (status === 'Terms Revised') {
      if (!neg.termsModificationRequest) neg.termsModificationRequest = {};
      if (customTerms) neg.termsModificationRequest.customTerms = customTerms;
      if (adminNotes)  neg.termsModificationRequest.adminNotes  = adminNotes;
      neg.termsModificationRequest.revisedAt = new Date();
      neg.buyerAgreed  = false;
      neg.sellerAgreed = false;
    }

    neg.history.push({
      event: `Status updated to "${status || 'unchanged'}" by ${req.user.role || 'User'}.`,
      actor: req.user.role || 'User',
      date:  new Date()
    });

    await neg.save();

    const updated = await Negotiation.findById(neg._id)
      .populate('property')
      .populate('buyer',  'full_name email')
      .populate('seller', 'full_name email');
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server Error: ' + err.message });
  }
});

module.exports = router;