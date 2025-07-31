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
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
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
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
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
// Serve static files in the "public" folder (like your index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Optional: Serve index.html when visiting root "/"
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- MONGODB CONNECTION ---
console.log('MONGODB_URI:', process.env.MONGODB_URI); // Debugging line; remove after testing!
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => { console.error('MongoDB Error:', err); process.exit(1); });

// --- DONOR ENDPOINTS ---
app.get('/api/donors', async (req, res) => {
  const donors = await Donor.find().sort({createdAt:-1});
  res.json(donors);
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

// --- RECIPIENT ENDPOINTS ---
app.get('/api/recipients', async (req, res) => {
  const recipients = await Recipient.find().sort({createdAt:-1});
  res.json(recipients);
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

// --- INVENTORY ENDPOINTS ---
app.get('/api/inventory', async (req, res) => {
  const inventory = await Inventory.find().sort({createdAt:-1});
  res.json(inventory);
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

// --- REQUEST ENDPOINTS ---
app.get('/api/requests', async (req, res) => {
  const requests = await Request.find().sort({createdAt:-1});
  res.json(requests);
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
// Approve/Reject
app.put('/api/requests/:id/approve', async (req, res) => {
  const reqObj = await Request.findByIdAndUpdate(req.params.id, {status: 'approved', processedBy: 'Auto Processor'}, {new:true});
  res.json(reqObj);
});
app.put('/api/requests/:id/reject', async (req, res) => {
  const reqObj = await Request.findByIdAndUpdate(req.params.id, {status: 'rejected', processedBy: 'Auto Processor'}, {new:true});
  res.json(reqObj);
});

// --- LOAD REQUESTS FUNCTION ---
async function loadRequests() {
  try {
    // Fetch all pending recipients
    const pendingRecipients = await Recipient.find({ status: 'pending' });

    for (const recipient of pendingRecipients) {
      // Check if request already exists for this recipient (by name, bloodType, hospital, unitsRequired)
      const existingRequest = await Request.findOne({
        recipientName: recipient.name,
        bloodType: recipient.bloodType,
        hospital: recipient.hospital,
        units: recipient.unitsRequired,
        status: 'pending'
      });
      if (!existingRequest) {
        // Create new request from recipient data
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

// --- AI PROCESSING FUNCTION ---
async function processRequestsAI() {
  try {
    // Fetch all pending requests
    const pendingRequests = await Request.find({ status: 'pending' });

    for (const request of pendingRequests) {
      // Check inventory for blood type
      const inventoryItem = await Inventory.findOne({ bloodType: request.bloodType });

      if (inventoryItem && inventoryItem.units >= request.units) {
        // Approve request
        request.status = 'approved';
        request.processedBy = 'Auto Processor';
        await request.save();

        // Reduce inventory units
        inventoryItem.units -= request.units;
        await inventoryItem.save();

        // Also update corresponding recipient status to approved
        await Recipient.findOneAndUpdate(
          { name: request.recipientName, bloodType: request.bloodType, hospital: request.hospital, unitsRequired: request.units },
          { status: 'approved', processedBy: 'Auto Processor' }
        );
      } else {
        // Reject request
        request.status = 'rejected';
        request.processedBy = 'Auto Processor';
        await request.save();

        // Also update corresponding recipient status to rejected
        await Recipient.findOneAndUpdate(
          { name: request.recipientName, bloodType: request.bloodType, hospital: request.hospital, unitsRequired: request.units },
          { status: 'rejected', processedBy: 'Auto Processor' }
        );
      }
    }
  } catch (error) {
    console.error('Error processing requests AI:', error);
  }
}

// --- API ENDPOINT TO TRIGGER LOAD AND PROCESS ---
app.post('/api/load-and-process-requests', async (req, res) => {
  try {
    await loadRequests();
    await processRequestsAI();
    res.json({ message: 'Requests loaded and processed by AI' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- DASHBOARD STATS ENDPOINT ---
app.get('/api/stats', async (req, res) => {
  const [totalDonors, totalRecipients, inventory, requests] = await Promise.all([
    Donor.countDocuments({}),
    Recipient.countDocuments({}),
    Inventory.find(),
    Request.find()
  ]);
  const pendingRequests = requests.filter(r => r.status==='pending').length;
  const totalUnits = inventory.reduce((sum, item)=>sum+item.units,0);
  res.json({
    data: {
      totalDonors,
      totalRecipients,
      totalUnits,
      pendingRequests
    }
  });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on https://blood-bank-ol4n.onrender.com`));
