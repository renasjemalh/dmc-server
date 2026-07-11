//index.js
const express = require('express');
const cors = require('cors');
const path = require('path'); 
const connectDB = require('./config/db');
require('dotenv').config();

// Initialize App
const app = express();

// 1. Connect to MongoDB Atlas
connectDB();

// 2. Middleware
app.use(cors());
app.use(express.json()); 

// Serve the 'uploads' folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 3. Define Routes
app.get('/', (req, res) => res.send('DMC Real Estate API Running...'));

// Auth Routes
app.use('/api/auth', require('./routes/auth'));

// Property Routes
app.use('/api/properties', require('./routes/propertyRoutes'));

// User Management Routes
app.use('/api/users', require('./routes/users'));

// Negotiation Routes
app.use('/api/negotiations', require('./routes/negotiationRoutes'));

// 🔥 FIX: Added Payment Routes for Chapa
// This ensures /api/payment/initialize and /api/payment/verify work
app.use('/api/payment', require('./routes/payment'));

// 4. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ All modules active: Auth, Property, Users, Negotiations, and Payments`);
});