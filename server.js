require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());

// CORS Configuration - Production Only
app.use(cors({
    origin: ['https://blood-bank-ol4n.onrender.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
});
app.use('/api/', limiter);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in .env!');
    process.exit(1);
}
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => {
    console.error('❌ MongoDB Atlas connection error:', err);
    process.exit(1);
});

// Schemas
const donorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 18, max: 65 },
    bloodType: {
        type: String,
        required: true,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    address: { type: String, required: true, trim: true },
    lastDonation: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const recipientSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 1, max: 120 },
    bloodType: {
        type: String,
        required: true,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    },
    phone: { type: String, required: true, trim: true },
    hospital: { type: String, required: true, trim: true },
    unitsRequired: { type: Number, required: true, min: 1, max: 10 },
    urgency: {
        type: String,
        required: true,
        enum: ['Low', 'Medium', 'High', 'Critical']
    },
    status: {
        type: String,
        default: 'pending',
        enum: ['pending', 'approved', 'rejected', 'fulfilled']
    },
    processedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const inventorySchema = new mongoose.Schema({
    bloodType: {
        type: String,
        required: true,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    },
    units: { type: Number, required: true, min: 1 },
    expiryDate: { type: Date, required: true },
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
    status: {
        type: String,
        default: 'available',
        enum: ['available', 'reserved', 'used', 'expired']
    },
    collectionDate: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient' },
    recipientName: { type: String, required: true },
    bloodType: {
        type: String,
        required: true,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    },
    units: { type: Number, required: true, min: 1 },
    hospital: { type: String, required: true },
    urgency: {
        type: String,
        required: true,
        enum: ['Low', 'Medium', 'High', 'Critical']
    },
    status: {
        type: String,
        default: 'pending',
        enum: ['pending', 'approved', 'rejected', 'fulfilled']
    },
    notes: { type: String, trim: true },
    processedBy: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Models
const Donor = mongoose.model('Donor', donorSchema);
const Recipient = mongoose.model('Recipient', recipientSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Request = mongoose.model('Request', requestSchema);

// Validation Middleware
const validateDonor = [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('age').isInt({ min: 18, max: 65 }).withMessage('Age must be between 18 and 65'),
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('phone').trim().isLength({ min: 10, max: 15 }).withMessage('Phone number must be between 10 and 15 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
    body('address').trim().isLength({ min: 10, max: 200 }).withMessage('Address must be between 10 and 200 characters')
];

const validateRecipient = [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('age').isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('phone').trim().isLength({ min: 10, max: 15 }).withMessage('Phone number must be between 10 and 15 characters'),
    body('hospital').trim().isLength({ min: 2, max: 100 }).withMessage('Hospital name must be between 2 and 100 characters'),
    body('unitsRequired').isInt({ min: 1, max: 10 }).withMessage('Units required must be between 1 and 10'),
    body('urgency').isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid urgency level')
];

const validateInventory = [
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('units').isInt({ min: 1 }).withMessage('Units must be at least 1'),
    body('expiryDate').isISO8601().withMessage('Invalid expiry date format')
];

// Helper Functions
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

const checkBloodCompatibility = (recipientBloodType, donorBloodType) => {
    const compatibility = {
        'A+': ['A+', 'A-', 'O+', 'O-'],
        'A-': ['A-', 'O-'],
        'B+': ['B+', 'B-', 'O+', 'O-'],
        'B-': ['B-', 'O-'],
        'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        'AB-': ['A-', 'B-', 'AB-', 'O-'],
        'O+': ['O+', 'O-'],
        'O-': ['O-']
    };
    return compatibility[recipientBloodType]?.includes(donorBloodType) || false;
};

const checkExpiredBlood = async () => {
    const now = new Date();
    await Inventory.updateMany(
        { expiryDate: { $lt: now }, status: 'available' },
        { status: 'expired' }
    );
};

// Root route - serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        environment: 'Production'
    });
});

// --- DONOR ENDPOINTS ---
app.get('/api/donors', async (req, res) => {
    try {
        const donors = await Donor.find().sort({ createdAt: -1 });
        res.json(donors);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/donors', validateDonor, handleValidationErrors, async (req, res) => {
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
        const recipients = await Recipient.find().sort({ createdAt: -1 });
        res.json(recipients);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/recipients', validateRecipient, handleValidationErrors, async (req, res) => {
    try {
        const recipient = new Recipient(req.body);
        await recipient.save();
        
        // Automatically create a request when recipient is added
        const request = new Request({
            recipientId: recipient._id,
            recipientName: recipient.name,
            bloodType: recipient.bloodType,
            units: recipient.unitsRequired,
            hospital: recipient.hospital,
            urgency: recipient.urgency,
            status: 'pending'
        });
        await request.save();
        
        res.status(201).json(recipient);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// --- INVENTORY ENDPOINTS ---
app.get('/api/inventory', async (req, res) => {
    try {
        await checkExpiredBlood(); // Check for expired blood before returning inventory
        const inventory = await Inventory.find().sort({ createdAt: -1 });
        res.json(inventory);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/inventory', validateInventory, handleValidationErrors, async (req, res) => {
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

// Manual approve/reject endpoints
app.put('/api/requests/:id/approve', async (req, res) => {
    try {
        const request = await Request.findByIdAndUpdate(
            req.params.id, 
            { 
                status: 'approved', 
                processedBy: 'Manual Administrator',
                updatedAt: new Date()
            }, 
            { new: true }
        );
        
        // Update corresponding recipient status
        if (request.recipientId) {
            await Recipient.findByIdAndUpdate(
                request.recipientId,
                { 
                    status: 'approved', 
                    processedBy: 'Manual Administrator',
                    updatedAt: new Date()
                }
            );
        }
        
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/requests/:id/reject', async (req, res) => {
    try {
        const request = await Request.findByIdAndUpdate(
            req.params.id, 
            { 
                status: 'rejected', 
                processedBy: 'Manual Administrator',
                updatedAt: new Date()
            }, 
            { new: true }
        );
        
        // Update corresponding recipient status
        if (request.recipientId) {
            await Recipient.findByIdAndUpdate(
                request.recipientId,
                { 
                    status: 'rejected', 
                    processedBy: 'Manual Administrator',
                    updatedAt: new Date()
                }
            );
        }
        
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- AI PROCESSING FUNCTIONS ---
async function loadRequests() {
    try {
        // Fetch all pending recipients that don't have corresponding requests
        const pendingRecipients = await Recipient.find({ status: 'pending' });

        for (const recipient of pendingRecipients) {
            // Check if request already exists for this recipient
            const existingRequest = await Request.findOne({
                recipientId: recipient._id,
                status: 'pending'
            });
            
            if (!existingRequest) {
                // Create new request from recipient data
                const newRequest = new Request({
                    recipientId: recipient._id,
                    recipientName: recipient.name,
                    bloodType: recipient.bloodType,
                    units: recipient.unitsRequired,
                    hospital: recipient.hospital,
                    urgency: recipient.urgency,
                    status: 'pending'
                });
                await newRequest.save();
                console.log(`✅ Created request for recipient: ${recipient.name}`);
            }
        }
    } catch (error) {
        console.error('❌ Error loading requests:', error);
    }
}

async function processRequestsAI() {
    try {
        await checkExpiredBlood(); // Remove expired blood first
        
        // Fetch all pending requests sorted by urgency and creation date
        const pendingRequests = await Request.find({ status: 'pending' })
            .sort({ 
                urgency: { 'Critical': 1, 'High': 2, 'Medium': 3, 'Low': 4 },
                createdAt: 1 
            });

        for (const request of pendingRequests) {
            console.log(`🔄 Processing request for ${request.recipientName} (${request.bloodType})`);
            
            // Check inventory for exact blood type match first
            let inventoryItem = await Inventory.findOne({ 
                bloodType: request.bloodType, 
                status: 'available',
                units: { $gte: request.units }
            });
            
            // If no exact match, check for compatible blood types
            if (!inventoryItem) {
                const compatibleTypes = getCompatibleBloodTypes(request.bloodType);
                inventoryItem = await Inventory.findOne({
                    bloodType: { $in: compatibleTypes },
                    status: 'available',
                    units: { $gte: request.units }
                });
            }

            if (inventoryItem && inventoryItem.units >= request.units) {
                // Calculate AI score based on multiple factors
                const aiScore = calculateAIScore(request, inventoryItem);
                
                if (aiScore >= 70) { // Approval threshold
                    // Approve request
                    request.status = 'approved';
                    request.processedBy = `AI Processor (Score: ${aiScore})`;
                    request.updatedAt = new Date();
                    await request.save();

                    // Reduce inventory units
                    inventoryItem.units -= request.units;
                    if (inventoryItem.units === 0) {
                        inventoryItem.status = 'used';
                    }
                    inventoryItem.updatedAt = new Date();
                    await inventoryItem.save();

                    // Update corresponding recipient status
                    if (request.recipientId) {
                        await Recipient.findByIdAndUpdate(
                            request.recipientId,
                            { 
                                status: 'approved', 
                                processedBy: `AI Processor (Score: ${aiScore})`,
                                updatedAt: new Date()
                            }
                        );
                    }
                    
                    console.log(`✅ Approved request for ${request.recipientName} (AI Score: ${aiScore})`);
                } else {
                    // Reject due to low AI score
                    request.status = 'rejected';
                    request.processedBy = `AI Processor (Score: ${aiScore} - Below threshold)`;
                    request.notes = `Rejected due to low priority score. Threshold: 70, Score: ${aiScore}`;
                    request.updatedAt = new Date();
                    await request.save();

                    // Update corresponding recipient status
                    if (request.recipientId) {
                        await Recipient.findByIdAndUpdate(
                            request.recipientId,
                            { 
                                status: 'rejected', 
                                processedBy: `AI Processor (Score: ${aiScore})`,
                                updatedAt: new Date()
                            }
                        );
                    }
                    
                    console.log(`❌ Rejected request for ${request.recipientName} (AI Score: ${aiScore})`);
                }
            } else {
                // Reject due to insufficient inventory
                request.status = 'rejected';
                request.processedBy = 'AI Processor (Insufficient Inventory)';
                request.notes = `Insufficient ${request.bloodType} blood units available. Required: ${request.units}`;
                request.updatedAt = new Date();
                await request.save();

                // Update corresponding recipient status
                if (request.recipientId) {
                    await Recipient.findByIdAndUpdate(
                        request.recipientId,
                        { 
                            status: 'rejected', 
                            processedBy: 'AI Processor (Insufficient Inventory)',
                            updatedAt: new Date()
                        }
                    );
                }
                
                console.log(`❌ Rejected request for ${request.recipientName} (Insufficient inventory)`);
            }
        }
    } catch (error) {
        console.error('❌ Error processing requests AI:', error);
    }
}

// AI Scoring Function
function calculateAIScore(request, inventoryItem) {
    let score = 0;
    
    // Urgency scoring (40% weight)
    const urgencyScores = { 'Critical': 40, 'High': 30, 'Medium': 20, 'Low': 10 };
    score += urgencyScores[request.urgency] || 0;
    
    // Blood type compatibility (30% weight)
    if (inventoryItem.bloodType === request.bloodType) {
        score += 30; // Exact match
    } else if (checkBloodCompatibility(request.bloodType, inventoryItem.bloodType)) {
        score += 20; // Compatible but not exact
    }
    
    // Inventory abundance (20% weight)
    if (inventoryItem.units >= request.units * 3) {
        score += 20; // Abundant supply
    } else if (inventoryItem.units >= request.units * 2) {
        score += 15; // Good supply
    } else if (inventoryItem.units >= request.units) {
        score += 10; // Just enough
    }
    
    // Freshness of blood (10% weight)
    const daysToExpiry = Math.floor((inventoryItem.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    if (daysToExpiry > 30) {
        score += 10; // Fresh blood
    } else if (daysToExpiry > 14) {
        score += 7; // Moderately fresh
    } else if (daysToExpiry > 7) {
        score += 5; // Still usable
    }
    
    return Math.min(100, Math.max(0, score)); // Ensure score is between 0-100
}

// Get compatible blood types for recipient
function getCompatibleBloodTypes(recipientBloodType) {
    const compatibility = {
        'A+': ['A+', 'O+'],
        'A-': ['A+', 'A-', 'O+', 'O-'],
        'B+': ['B+', 'O+'],
        'B-': ['B+', 'B-', 'O+', 'O-'],
        'AB+': ['AB+', 'A+', 'B+', 'O+'],
        'AB-': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
        'O+': ['O+'],
        'O-': ['O+', 'O-']
    };
    return compatibility[recipientBloodType] || [];
}

// --- API ENDPOINT TO TRIGGER LOAD AND PROCESS ---
app.post('/api/load-and-process-requests', async (req, res) => {
    try {
        console.log('🤖 Starting AI request processing...');
        await loadRequests();
        await processRequestsAI();
        res.json({ 
            success: true,
            message: 'Requests loaded and processed by AI successfully' 
        });
    } catch (error) {
        console.error('❌ Error in load-and-process-requests:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// --- DASHBOARD STATS ENDPOINT ---
app.get('/api/stats', async (req, res) => {
    try {
        await checkExpiredBlood(); // Update expired blood before calculating stats
        
        const [totalDonors, totalRecipients, inventory, requests] = await Promise.all([
            Donor.countDocuments({}),
            Recipient.countDocuments({}),
            Inventory.find({ status: 'available' }), // Only count available inventory
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
                pendingRequests,
                approvedRequests,
                rejectedRequests,
                totalRequests: requests.length
            }
        });
    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Periodic AI processing (every 30 minutes)
setInterval(async () => {
    console.log('🤖 Running scheduled AI processing...');
    try {
        await loadRequests();
        await processRequestsAI();
        console.log('✅ Scheduled AI processing completed');
    } catch (error) {
        console.error('❌ Scheduled AI processing failed:', error);
    }
}, 30 * 60 * 1000); // 30 minutes

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong!',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler (keep last)
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Blood Bank Management Server running on port ${PORT}`);
    console.log(`🌐 Environment: Production`);
    console.log(`📊 Dashboard: https://blood-bank-ol4n.onrender.com/health`);
    console.log(`🔗 API Base URL: https://blood-bank-ol4n.onrender.com/api`);
    console.log(`🌐 Frontend: https://blood-bank-ol4n.onrender.com`);
    
    // Run initial AI processing after server starts
    setTimeout(async () => {
        console.log('🤖 Running initial AI processing...');
        try {
            await loadRequests();
            await processRequestsAI();
            console.log('✅ Initial AI processing completed');
        } catch (error) {
            console.error('❌ Initial AI processing failed:', error);
        }
    }, 5000); // Wait 5 seconds after server start
});

// Graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
    console.log('📤 SIGTERM received, shutting down gracefully');
    mongoose.connection.close(() => {
        console.log('📤 MongoDB connection closed');
        process.exit(0);
    });
});

module.exports = app;