require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path')
const app = express();
const port = process.env.PORT || 8000;
require('./config/firebase-config')
// Middleware to parse JSON bodies
app.use(express.json());
// Enable CORS for all origins
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};// Enable preflight for all routes
app.use(cors(corsOptions));
// ✅ Parse incoming JSON

// Optional: Parse URL-encoded bodies (for forms)
app.use(express.urlencoded({ extended: true }));
// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

  const UserRoutes = require('./Routes/User/User');
  const DistributerRoutes = require('./Routes/Distributer/Distributer');


  app.use('/api/v1/user', UserRoutes);
  app.use('/api/v1/distributer', DistributerRoutes);
  app.use('/api/v1/order', require('./Routes/Order/Order'));
  app.use('/api/v1/paper-dispatch', require('./Routes/PaperDispatch/PaperDispatch'));
  app.use('/api/v1/transactions', require('./Routes/Transcations/Transcations'));
  app.use('/api/v1/admin', require('./Routes/Admin/Admin'));
  // Start the server
app.listen(port, () => {
  console.log(`🌐 Server is running on port ${port}`);
});