//routes/propertyRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer'); 
const path = require('path');
const Property = require('../models/Property');
const User = require('../models/User'); 
const Negotiation = require('../models/Negotiation'); 
const { auth, checkRole } = require('../middleware/auth');

// --- Configure Local Storage for Images ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); 
  },
  filename: function (req, file, cb) {
    cb(null, 'property-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5000000 }, 
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|webp/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) return cb(null, true);
    cb(new Error("Only images are allowed"));
  }
});

// --- LIST ROUTES ---

router.get('/available', async (req, res) => {
  try {
    const properties = await Property.find({ status: 'Available' })
      .populate('owner', 'full_name email')
      .sort({ createdAt: -1 });
    res.json(properties);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const myProperties = await Property.find({ owner: req.user.id }).sort({ createdAt: -1 });
    res.json(myProperties);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.get('/pending', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const properties = await Property.find({ status: 'Pending' }).populate('owner', 'full_name email phone');
    res.json(properties);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.get('/payment-requests', [auth, checkRole('Admin')], async (req, res) => {
  try {
    // FIX: Include 'Rented' properties that reached the 20% milestone
    const properties = await Property.find({ 
      status: { $in: ['Reserved', 'Rented'] }, 
      structuralMilestone: 20 
    }).populate('owner', 'full_name email');
    res.json(properties);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.get('/under-review', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const properties = await Property.find({ status: 'Under Review', structuralMilestone: 100 });
    res.json(properties);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.get('/uncertified', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    const properties = await Property.find({ isCertified: false, purpose: 'Sale' });
    res.json(properties);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.get('/reserved', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    // FIX: Include 'Rented' properties in the Engineer's view for tracking
    const properties = await Property.find({ 
      status: { $in: ['Reserved', 'Rented'] }, 
      structuralMilestone: { $lt: 20 } 
    }).populate('owner', 'full_name email');
    res.json(properties);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// --- ACTION ROUTES ---

router.delete('/:id', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ msg: "Property not found" });
    await Property.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Property removed successfully' });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.post('/', [auth, upload.single('image')], async (req, res) => {
  try {
    const { purpose, advance_months } = req.body;
    if (purpose === 'Rent' && parseInt(advance_months) > 2) {
      return res.status(400).json({ msg: "Legal Violation: Advance payment cannot exceed 2 months." });
    }
    const newProperty = new Property({
      ...req.body,
      owner: req.user.id,
      image_url: req.file ? req.file.path : null,
      isCertified: false,
      status: 'Pending',   
    });
    const property = await newProperty.save();
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error: ' + err.message });
  }
});

router.put('/certify/:id', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(req.params.id, { isCertified: true }, { new: true });
    if (!property) return res.status(404).json({ msg: "Property not found" });
    res.json(property);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.put('/report-progress/:id', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ msg: "Property not found" });
    
    property.structuralMilestone = 20;
    // Status stays as is (Reserved or Rented) until Admin verification
    await property.save();
    res.json({ msg: "20% Completion reported. Admin must now verify to trigger payment.", property });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.put('/verify-milestone/:id', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ msg: "Property not found" });

    property.status = 'Payment Request Sent'; 
    await property.save();

    // FIX: Search for the negotiation regardless of whether it is 'Reserved' or 'Rented'
    await Negotiation.findOneAndUpdate(
      { property: req.params.id, status: { $in: ['Reserved', 'Rented'] } },
      { status: 'Approved by Admin' } 
    );

    res.json({ msg: "Milestone verified. Buyer can now pay the installment.", property });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.put('/report-completion/:id', [auth, checkRole('Engineer')], async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ msg: "Property not found" });

    property.structuralMilestone = 100;
    property.status = 'Under Review'; 
    await property.save();

    res.json({ msg: "Building completion reported. Admin notified for final payment request.", property });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.put('/approve/:id', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ msg: "Property not found" });
    if (property.purpose === 'Sale' && !property.isCertified) {
      return res.status(400).json({ msg: "Cannot approve: Site Engineer inspection required." });
    }
    property.status = 'Available';
    await property.save();
    res.json(property);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.put('/request-final-payment/:id', [auth, checkRole('Admin')], async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ msg: "Property not found" });

    property.status = 'Final Payment Requested';
    await property.save();

    await Negotiation.findOneAndUpdate(
        { property: req.params.id, status: 'Paid 20%' },
        { status: 'Final Payment Requested' }
    );

    res.json({ msg: "Final 80% payment request sent to Buyer", property });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('owner', 'full_name email phone')
      .populate('comments.user', 'full_name'); 
    if (!property) return res.status(404).json({ msg: "Property not found" });
    res.json(property);
  } catch (err) {
    if (err.kind === 'ObjectId') return res.status(404).json({ msg: "Property not found" });
    res.status(500).send('Server Error');
  }
});

module.exports = router;