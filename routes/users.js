//routes/users.js
const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const { auth } = require('../middleware/auth');

// @route    GET api/users/me
// @desc     Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// @route    GET api/users/favorites
// @desc     Get full property details for user's favorites
router.get('/favorites', auth, async (req, res) => {
  try {
    // .populate('favorites') is essential for the FavoritesList component 
    // to show images, prices, and locations.
    const user = await User.findById(req.user.id).populate('favorites');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    
    res.json(user.favorites);
  } catch (err) {
    console.error("Favorites Fetch Error:", err.message);
    res.status(500).send('Server Error');
  }
});

// @route    PUT api/users/favorite/:property_id
// @desc     Toggle favorite status
router.put('/favorite/:property_id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const propertyId = req.params.property_id;

    // FIX: Convert ObjectIds to strings for accurate comparison
    const isFavorite = user.favorites.some(fav => fav.toString() === propertyId);
    
    const update = isFavorite 
      ? { $pull: { favorites: propertyId } } 
      : { $addToSet: { favorites: propertyId } };

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id, 
      update, 
      { new: true }
    ).select('favorites');

    res.json(updatedUser.favorites);
  } catch (err) {
    console.error("Toggle Favorite Error:", err.message);
    res.status(500).send('Server Error');
  }
});

// @route    GET api/users
// @desc     Get all users (Admin only)
router.get('/', auth, async (req, res) => {
  try {
    // Ensure the model uses 'createdAt' as a field
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// @route    PUT api/users/:id
// @desc     Update user details (Admin Edit)
router.put('/:id', auth, async (req, res) => {
  const { full_name, email, role, status } = req.body;
  try {
    let user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (full_name) user.full_name = full_name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (status) user.status = status;

    await user.save();
    res.json(user);
  } catch (err) {
    console.error("User Update Error:", err.message);
    res.status(500).send('Server Error');
  }
});

// @route    DELETE api/users/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: 'User removed successfully' });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;