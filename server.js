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
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient' },
  recipientName: String,
  bloodType: String,
  units: Number,
  hospital: String,
  urgency: String,
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  processedBy: { type: String, default: null },
  autoProcessed: { type: Boolean, default: false },
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
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => { console.error('MongoDB Error:', err); process.exit(1); });

// --- AI LOGIC FOR AUTO-PROCESSING REQUESTS ---
async function checkInventoryAndAutoProcess(bloodType, unitsNeeded) {
  try {
    // Get available inventory for this blood type
    const inventoryItems = await Inventory.find({ 
      bloodType: bloodType,
      expiryDate: { $gt: new Date() } // Only non-expired items
    }).sort({ expiryDate: 1 }); // Sort by expiry date (oldest first)
    
    const totalAvailable = inventoryItems.reduce((sum, item) => sum + item.units, 0);
    
    console.log(`Blood type ${bloodType}: Available ${totalAvailable}, Needed ${unitsNeeded}`);
    
    if (totalAvailable >= unitsNeeded) {
      // Sufficient inventory available - approve and deduct
      await deductInventory(bloodType, unitsNeeded);
      return { 
        approved: true, 
        reason: `Auto-approved: Sufficient inventory available (${totalAvailable} units)` 
      };
    } else if (totalAvailable > 0) {
      // Partial inventory - reject with reason
      return { 
        approved: false, 
        reason: `Auto-rejected: Insufficient inventory (${totalAvailable} available, ${unitsNeeded} needed)` 
      };
    } else {
      // No inventory - reject
      return { 
        approved: false, 
        reason: `Auto-rejected: No inventory available for blood type ${bloodType}` 
      };
    }
  } catch (error) {
    console.error('Error in auto-processing:', error);
    return { 
      approved: false, 
      reason: 'Auto-rejected: System error during processing' 
    };
  }
}

async function deductInventory(bloodType, unitsNeeded) {
  try {
    const inventoryItems = await Inventory.find({ 
      bloodType: bloodType,
      expiryDate: { $gt: new Date() },
      units: { $gt: 0 }
    }).sort({ expiryDate: 1 });
    
    let remainingUnits = unitsNeeded;
    
    for (const item of inventoryItems) {
      if (remainingUnits <= 0) break;
      
      if (item.units >= remainingUnits) {
        // This item has enough units
        item.units -= remainingUnits;
        remainingUnits = 0;
        
        if (item.units === 0) {
          await Inventory.findByIdAndDelete(item._id);
        } else {
          await item.save();
        }
      } else {
        // Use all units from this item
        remainingUnits -= item.units;
        await Inventory.findByIdAndDelete(item._id);
      }
    }
    
    console.log(`Successfully deducted ${unitsNeeded} units of ${bloodType}`);
  } catch (error) {
    console.error('Error deducting inventory:', error);
    throw error;
  }
}

// --- DONOR ENDPOINTS ---
app.get('/api/donors', async (req, res) => {
  try {
    const donors = await Donor.find().sort({createdAt:-1});
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

// --- RECIPIENT ENDPOINTS ---
app.get('/api/recipients', async (req, res) => {
  try {
    const recipients = await Recipient.find().sort({createdAt:-1});
    res.json(recipients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recipients', async (req, res) => {
  try {
    const recipient = new Recipient(req.body);
    await recipient.save();
    
    // AUTO-CREATE REQUEST AND PROCESS IT
    const requestData = {
      recipientId: recipient._id,
      recipientName: recipient.name,
      bloodType: recipient.bloodType,
      units: recipient.unitsRequired,
      hospital: recipient.hospital,
      urgency: recipient.urgency,
      status: 'pending',
      autoProcessed: true
    };
    
    const request = new Request(requestData);
    
    // Auto-process the request based on inventory
    const processResult = await checkInventoryAndAutoProcess(
      recipient.bloodType, 
      recipient.unitsRequired
    );
    
    if (processResult.approved) {
      request.status = 'approved';
      request.processedBy = 'AI Auto Processor';
      recipient.status = 'approved';
      recipient.processedBy = 'AI Auto Processor';
    } else {
      request.status = 'rejected';
      request.processedBy = 'AI Auto Processor';
      recipient.status = 'rejected';
      recipient.processedBy = 'AI Auto Processor';
    }
    
    await request.save();
    await recipient.save();
    
    console.log(`Request auto-processed: ${processResult.approved ? 'APPROVED' : 'REJECTED'} - ${processResult.reason}`);
    
    res.status(201).json({
      recipient: recipient,
      request: request,
      autoProcessResult: processResult
    });
    
  } catch (error) {
    console.error('Error creating recipient/request:', error);
    res.status(400).json({ error: error.message });
  }
});

// --- INVENTORY ENDPOINTS ---
app.get('/api/inventory', async (req, res) => {
  try {
    const inventory = await Inventory.find().sort({createdAt:-1});
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const item = new Inventory(req.body);
    await item.save();
    
    // After adding inventory, check if any pending requests can now be approved
    await reprocessPendingRequests();
    
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Function to reprocess pending requests when new inventory is added
async function reprocessPendingRequests() {
  try {
    const pendingRequests = await Request.find({ 
      status: 'pending',
      autoProcessed: true 
    }).sort({ createdAt: 1 }); // Process oldest first
    
    for (const request of pendingRequests) {
      const processResult = await checkInventoryAndAutoProcess(
        request.bloodType, 
        request.units
      );
      
      if (processResult.approved) {
        request.status = 'approved';
        request.processedBy = 'AI Auto Processor (Reprocessed)';
        await request.save();
        
        // Update corresponding recipient
        await Recipient.findByIdAndUpdate(request.recipientId, {
          status: 'approved',
          processedBy: 'AI Auto Processor (Reprocessed)'
        });
        
        console.log(`Reprocessed request ${request._id}: APPROVED`);
      }
    }
  } catch (error) {
    console.error('Error reprocessing pending requests:', error);
  }
}

// --- REQUEST ENDPOINTS ---
app.get('/api/requests', async (req, res) => {
  try {
    const requests = await Request.find().sort({createdAt:-1});
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const request = new Request(req.body);
    
    // Auto-process if enabled
    if (req.body.autoProcess !== false) {
      const processResult = await checkInventoryAndAutoProcess(
        request.bloodType, 
        request.units
      );
      
      if (processResult.approved) {
        request.status = 'approved';
        request.processedBy = 'AI Auto Processor';
      } else {
        request.status = 'rejected';
        request.processedBy = 'AI Auto Processor';
      }
      request.autoProcessed = true;
    }
    
    await request.save();
    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Manual approve/reject (for admin override)
app.put('/api/requests/:id/approve', async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Manually approve and deduct inventory
    await deductInventory(request.bloodType, request.units);
    
    request.status = 'approved';
    request.processedBy = 'Manual Admin Approval';
    await request.save();
    
    // Update corresponding recipient if exists
    if (request.recipientId) {
      await Recipient.findByIdAndUpdate(request.recipientId, {
        status: 'approved',
        processedBy: 'Manual Admin Approval'
      });
    }
    
    res.json(request);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/requests/:id/reject', async (req, res) => {
  try {
    const request = await Request.findByIdAndUpdate(req.params.id, {
      status: 'rejected', 
      processedBy: 'Manual Admin Rejection'
    }, {new: true});
    
    // Update corresponding recipient if exists
    if (request.recipientId) {
      await Recipient.findByIdAndUpdate(request.recipientId, {
        status: 'rejected',
        processedBy: 'Manual Admin Rejection'
      });
    }
    
    res.json(request);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- DASHBOARD STATS ENDPOINT ---
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
      data: {
        totalDonors,
        totalRecipients,
        totalUnits,
        pendingRequests,
        approvedRequests,
        rejectedRequests,
        totalRequests: requests.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- CLEANUP EXPIRED INVENTORY (Optional utility endpoint) ---
app.post('/api/cleanup-expired', async (req, res) => {
  try {
    const result = await Inventory.deleteMany({
      expiryDate: { $lt: new Date() }
    });
    
    res.json({ 
      message: `Cleaned up ${result.deletedCount} expired inventory items` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access your app at: https://blood-bank-ol4n.onrender.com`);
});