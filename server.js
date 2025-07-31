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
