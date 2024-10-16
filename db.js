const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log('connected to mongodb successfully');
  } catch (error) {
    console.error('MongoDB connection failed', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
