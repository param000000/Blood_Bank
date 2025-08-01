require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// --- MODELS ---

const donorSchema = new mongoose.Schema({
  name: String,
  age: Number,
  bloodType: String,
  phone: String,
  email: { type: String, unique: true },
  address: String,
  createdAt: { type: Date, default: Date.now }
});

const recipientSchema = new mongoose.Schema({
  name: String,
  age: Number,
  bloodType: String,
  phone: String,
  hospital: String,
  unitsRequired: Number,
  urgency: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  processedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const inventorySchema = new mongoose.Schema({
  bloodType: String,
  units: Number,
  expiryDate: Date,
  createdAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
  recipientName: String,
  bloodType: String,
  units: Number,
  hospital: String,
  urgency: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  processedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const Donor = mongoose.model('Donor', donorSchema);
const Recipient = mongoose.model('Recipient', recipientSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Request = mongoose.model('Request', requestSchema);

// --- APP INITIALIZATION ---

const app = express();

app.use(cors());
app.use(bodyParser.json());

// --- SERVE FRONTEND ---

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- MONGODB CONNECTION ---

console.log('MONGODB_URI:', process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Error:', err);
    process.exit(1);
  });

// --- API ENDPOINTS ---

// Donors
app.get('/api/donors', async (req, res) => {
  try {
    const donors = await Donor.find().sort({ createdAt: -1 });
    res.json(donors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/donors', async (req, res) => {
  try {
    const donor = new Donor(req.body);
    await donor.save();
    res.status(201).json(donor);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Donor email already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// Recipients
app.get('/api/recipients', async (req, res) => {
  try {
    const recipients = await Recipient.find().sort({ createdAt: -1 });
    res.json(recipients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recipients', async (req, res) => {
  try {
    const recipient = new Recipient(req.body);
    await recipient.save();
    res.status(201).json(recipient);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Inventory
app.get('/api/inventory', async (req, res) => {
  try {
    const inventory = await Inventory.find().sort({ createdAt: -1 });
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const item = new Inventory(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Requests
app.get('/api/requests', async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const request = new Request(req.body);
    await request.save();
    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Approve requests
app.put('/api/requests/:id/approve', async (req, res) => {
  try {
    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', processedBy: 'Auto Processor' },
      { new: true }
    );
    res.json(updatedRequest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject requests
app.put('/api/requests/:id/reject', async (req, res) => {
  try {
    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', processedBy: 'Auto Processor' },
      { new: true }
    );
    res.json(updatedRequest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Load requests helper function
async function loadRequests() {
  try {
    const pendingRecipients = await Recipient.find({ status: 'pending' });
    for (const recipient of pendingRecipients) {
      const existingRequest = await Request.findOne({
        recipientName: recipient.name,
        bloodType: recipient.bloodType,
        hospital: recipient.hospital,
        units: recipient.unitsRequired,
        status: 'pending'
      });
      if (!existingRequest) {
        const newRequest = new Request({
          recipientName: recipient.name,
          bloodType: recipient.bloodType,
          units: recipient.unitsRequired,
          hospital: recipient.hospital,
          urgency: recipient.urgency,
          status: 'pending',
          processedBy: null
        });
        await newRequest.save();
      }
    }
  } catch (error) {
    console.error('Error loading requests:', error);
  }
}

// AI process requests function
async function processRequestsAI() {
  try {
    const pendingRequests = await Request.find({ status: 'pending' });

    for (const request of pendingRequests) {
      const inventoryItem = await Inventory.findOne({ bloodType: request.bloodType });

      if (inventoryItem && inventoryItem.units >= request.units) {
        // Approve
        request.status = 'approved';
        request.processedBy = 'Auto Processor';
        await request.save();

        // Update inventory units
        inventoryItem.units -= request.units;
        await inventoryItem.save();

        // Update recipient status
        await Recipient.findOneAndUpdate(
          {
            name: request.recipientName,
            bloodType: request.bloodType,
            hospital: request.hospital,
            unitsRequired: request.units
          },
          { status: 'approved', processedBy: 'Auto Processor' }
        );
      } else {
        // Reject
        request.status = 'rejected';
        request.processedBy = 'Auto Processor';
        await request.save();

        // Update recipient status
        await Recipient.findOneAndUpdate(
          {
            name: request.recipientName,
            bloodType: request.bloodType,
            hospital: request.hospital,
            unitsRequired: request.units
          },
          { status: 'rejected', processedBy: 'Auto Processor' }
        );
      }
    }
  } catch (error) {
    console.error('Error processing requests AI:', error);
  }
}

// API to trigger load and process
app.post('/api/load-and-process-requests', async (req, res) => {
  try {
    await loadRequests();
    await processRequestsAI();
    res.json({ message: 'Requests loaded and processed by AI' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const [totalDonors, totalRecipients, inventory, requests] = await Promise.all([
      Donor.countDocuments({}),
      Recipient.countDocuments({}),
      Inventory.find(),
      Request.find()
    ]);
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const totalUnits = inventory.reduce((sum, item) => sum + item.units, 0);

    res.json({
      data: {
        totalDonors,
        totalRecipients,
        totalUnits,
        pendingRequests
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SPA fallback route — must be last
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- START SERVER ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on https://blood-bank-c6l5.onrender.com/`));
