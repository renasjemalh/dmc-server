//config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log("⏳ Attempting to connect to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000, // Wait 5 seconds before failing
    });
    console.log("✅ MongoDB Atlas Connected Successfully!");
  } catch (err) {
    console.error("❌ MONGODB CONNECTION ERROR:");
    console.error("Technical Message:", err.message);
    console.error("Error Code:", err.code);
    // process.exit(1); // Comment this out so nodemon doesn't crash immediately
  }
};

module.exports = connectDB;