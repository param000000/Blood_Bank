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
    res.json({
      success: true,
      data: donors,
      count: donors.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

app.post('/api/donors', async (req, res) => {
  try {
    const donor = new Donor(req.body);
    await donor.save();
    res.status(201).json({
      success: true,
      message: 'Donor created successfully',
      data: donor
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        error: 'Donor email already exists',
        data: null
      });
    } else {
      res.status(400).json({
        success: false,
        error: error.message,
        data: null
      });
    }
  }
});

// Recipients
app.get('/api/recipients', async (req, res) => {
  try {
    const recipients = await Recipient.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: recipients,
      count: recipients.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

app.post('/api/recipients', async (req, res) => {
  try {
    const recipient = new Recipient(req.body);
    await recipient.save();
    res.status(201).json({
      success: true,
      message: 'Recipient created successfully',
      data: recipient
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

// Inventory
app.get('/api/inventory', async (req, res) => {
  try {
    const inventory = await Inventory.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: inventory,
      count: inventory.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const item = new Inventory(req.body);
    await item.save();
    res.status(201).json({
      success: true,
      message: 'Inventory item created successfully',
      data: item
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

// Requests
app.get('/api/requests', async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: requests,
      count: requests.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const request = new Request(req.body);
    await request.save();
    res.status(201).json({
      success: true,
      message: 'Request created successfully',
      data: request
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

// Approve/Reject Requests
app.put('/api/requests/:id/approve', async (req, res) => {
  try {
    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', processedBy: 'Auto Processor' },
      { new: true }
    );
    
    if (!updatedRequest) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
        data: null
      });
    }
    
    res.json({
      success: true,
      message: 'Request approved successfully',
      data: updatedRequest
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

app.put('/api/requests/:id/reject', async (req, res) => {
  try {
    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', processedBy: 'Auto Processor' },
      { new: true }
    );
    
    if (!updatedRequest) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
        data: null
      });
    }
    
    res.json({
      success: true,
      message: 'Request rejected successfully',
      data: updatedRequest
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

// --- Helper Functions ---

async function loadRequests() {
  try {
    const pendingRecipients = await Recipient.find({ status: 'pending' });
    let createdCount = 0;
    
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
        createdCount++;
      }
    }
    
    return { createdCount };
  } catch (error) {
    console.error('Error loading requests:', error);
    throw error;
  }
}

async function processRequestsAI() {
  try {
    const pendingRequests = await Request.find({ status: 'pending' });
    let processedCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    
    for (const request of pendingRequests) {
      const inventoryItem = await Inventory.findOne({ bloodType: request.bloodType });
      
      if (inventoryItem && inventoryItem.units >= request.units) {
        // Approve request
        request.status = 'approved';
        request.processedBy = 'Auto Processor';
        await request.save();

        // Update inventory
        inventoryItem.units -= request.units;
        await inventoryItem.save();

        // Update recipient
        await Recipient.findOneAndUpdate(
          {
            name: request.recipientName,
            bloodType: request.bloodType,
            hospital: request.hospital,
            unitsRequired: request.units
          },
          { status: 'approved', processedBy: 'Auto Processor' }
        );
        
        approvedCount++;
      } else {
        // Reject request
        request.status = 'rejected';
        request.processedBy = 'Auto Processor';
        await request.save();

        // Update recipient
        await Recipient.findOneAndUpdate(
          {
            name: request.recipientName,
            bloodType: request.bloodType,
            hospital: request.hospital,
            unitsRequired: request.units
          },
          { status: 'rejected', processedBy: 'Auto Processor' }
        );
        
        rejectedCount++;
      }
      processedCount++;
    }
    
    return { processedCount, approvedCount, rejectedCount };
  } catch (error) {
    console.error('Error processing requests AI:', error);
    throw error;
  }
}

app.post('/api/load-and-process-requests', async (req, res) => {
  try {
    const loadResult = await loadRequests();
    const processResult = await processRequestsAI();
    
    res.json({
      success: true,
      message: 'Requests loaded and processed by AI',
      data: {
        requestsCreated: loadResult.createdCount,
        requestsProcessed: processResult.processedCount,
        requestsApproved: processResult.approvedCount,
        requestsRejected: processResult.rejectedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

// Dashboard stats
app.get('/api/stats', async (req, res) => {
  try {
    const [totalDonors, totalRecipients, inventory, requests] = await Promise.all([
      Donor.countDocuments({}),
      Recipient.countDocuments({}),
      Inventory.find(),
      Request.find()
    ]);
    
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const approvedRequests = requests.filter(r => r.status === 'approved').length;
    const rejectedRequests = requests.filter(r => r.status === 'rejected').length;
    const totalUnits = inventory.reduce((sum, item) => sum + item.units, 0);

    res.json({
      success: true,
      data: {
        totalDonors,
        totalRecipients,
        totalUnits,
        totalRequests: requests.length,
        pendingRequests,
        approvedRequests,
        rejectedRequests,
        inventory: inventory.map(item => ({
          bloodType: item.bloodType,
          units: item.units,
          expiryDate: item.expiryDate
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

// Get individual donor by ID
app.get('/api/donors/:id', async (req, res) => {
  try {
    const donor = await Donor.findById(req.params.id);
    if (!donor) {
      return res.status(404).json({
        success: false,
        error: 'Donor not found',
        data: null
      });
    }
    res.json({
      success: true,
      data: donor
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

// Get individual recipient by ID
app.get('/api/recipients/:id', async (req, res) => {
  try {
    const recipient = await Recipient.findById(req.params.id);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        error: 'Recipient not found',
        data: null
      });
    }
    res.json({
      success: true,
      data: recipient
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: null
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Blood Bank API is running',
    timestamp: new Date().toISOString(),
    data: {
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    }
  });
});

// SPA fallback route — must be last
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- START SERVER ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));