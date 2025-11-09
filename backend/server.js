const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Kafka } = require('kafkajs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const transactionSchema = new mongoose.Schema({
  transactionId: String,
  accountId: String,
  amount: Number,
  merchant: String,
  category: String,
  location: Object,
  mlScore: Number,
  riskLevel: String,
  fraudIndicators: [String],
  timestamp: { type: Date, default: Date.now }
});

const alertSchema = new mongoose.Schema({
  alertId: String,
  transactionId: String,
  transaction: Object,
  mlScore: Object,
  riskLevel: String,
  reasons: Array,
  status: { type: String, default: 'PENDING' },
  assignedTo: String,
  reviewedAt: Date,
  action: String,
  comments: String,
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
const Alert = mongoose.model('Alert', alertSchema);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

const kafka = new Kafka({
  clientId: 'fraud-detection-system',
  brokers: [process.env.KAFKA_BROKERS]
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'fraud-detection-group' });

(async () => {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: 'transactions', fromBeginning: false });
  
  console.log('✅ Kafka Connected - Advanced Fraud Detection System');
  console.log('📡 User: sukshamrainaa | 2025-11-04 21:02:08 UTC');

  consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const txn = JSON.parse(message.value.toString());
        const transactionId = txn.id || txn.transactionId;
        
        if (!transactionId) {
          console.log('⚠️  Skipping transaction without ID');
          return;
        }
        
        console.log(`📨 Processing: ${transactionId}`);
        
        let score = 0;
        const indicators = [];

        if (txn.location?.risk === 'high') {
          score += 0.5;
          indicators.push({ code: 'HIGH_RISK_GEOGRAPHY', message: `HIGH RISK: ${txn.location.country}` });
        }

        if (txn.cvvMatch === false) {
          score += 0.3;
          indicators.push({ code: 'CVV_VERIFICATION_FAILED', message: 'CVV FAILED' });
        }

        if (txn.avsMatch === false) {
          score += 0.15;
          indicators.push({ code: 'ADDRESS_VERIFICATION_FAILED', message: 'AVS failed' });
        }

        if (txn.amount > 100000) {
          score += 0.2;
          indicators.push({ code: 'UNUSUAL_TRANSACTION_AMOUNT', message: `High amount: ₹${txn.amount.toLocaleString()}` });
        } else if (txn.amount > 50000) {
          score += 0.1;
          indicators.push({ code: 'UNUSUAL_TRANSACTION_AMOUNT', message: `Medium amount: ₹${txn.amount.toLocaleString()}` });
        }

        const suspiciousMerchants = ['UNKNOWN_MERCHANT', 'CRYPTO_EXCHANGE', 'OFFSHORE_CASINO', 'HIGH_RISK_VENDOR'];
        if (suspiciousMerchants.some(m => txn.merchant?.includes(m))) {
          score += 0.3;
          indicators.push({ code: 'HIGH_RISK_MERCHANT', message: `Suspicious: ${txn.merchant}` });
        }

        const suspiciousCategories = ['GAMBLING', 'CRYPTO', 'WIRE_TRANSFER', 'GIFT_CARDS'];
        if (suspiciousCategories.includes(txn.category)) {
          score += 0.25;
          indicators.push({ code: 'HIGH_RISK_MERCHANT_CATEGORY', message: `Category: ${txn.category}` });
        }

        if (txn.device === 'Emulator' || txn.device === 'Unknown Device' || txn.device === 'Rooted Android' || txn.device === 'Jailbroken iPhone') {
          score += 0.2;
          indicators.push({ code: 'SUSPICIOUS_DEVICE', message: 'Suspicious device' });
        }

        if (txn.isVPN || txn.isTor) {
          score += 0.15;
          indicators.push({ code: 'VPN_OR_PROXY_DETECTED', message: txn.isTor ? 'Tor detected' : 'VPN detected' });
        }

        if (txn.previousDeclines >= 3) {
          score += 0.3;
          indicators.push({ code: 'CARD_TESTING_PATTERN', message: `${txn.previousDeclines} declines` });
        }

        if (txn.accountAge < 30) {
          score += 0.1;
          indicators.push({ code: 'NEW_ACCOUNT_RISK', message: 'New account' });
        }

        const hour = new Date(txn.timestamp).getHours();
        if (hour >= 23 || hour <= 5) {
          score += 0.08;
          indicators.push({ code: 'UNUSUAL_TRANSACTION_TIME', message: 'Night transaction' });
        }

        const riskLevel = score >= 0.7 ? 'CRITICAL' : 
                          score >= 0.5 ? 'HIGH' : 
                          score >= 0.3 ? 'MEDIUM' : 'LOW';
        
        console.log(`📊 ${transactionId} | Score: ${score.toFixed(2)} | ${riskLevel}`);

        await Transaction.create({
          transactionId,
          accountId: txn.accountId,
          amount: txn.amount,
          merchant: txn.merchant,
          category: txn.category,
          location: txn.location,
          mlScore: score,
          riskLevel,
          fraudIndicators: indicators.map(i => i.message)
        });
        
        console.log(`✅ Saved: ${transactionId}`);
        
        if (score >= 0.4) {
          const alert = await Alert.create({
            alertId: `ALERT${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
            transactionId,
            transaction: txn,
            mlScore: { score },
            riskLevel,
            reasons: indicators,
            status: 'PENDING'
          });
          console.log(`🚨 ALERT: ${alert.alertId} | ${riskLevel}`);
        } else {
          console.log(`✓ Clean (Score: ${score.toFixed(2)})`);
        }
        
      } catch (error) {
        console.error('❌ Error:', error.message);
      }
    }
  });
})();

// ==================== API ROUTES ====================

app.post('/api/transactions', async (req, res) => {
  try {
    await producer.send({
      topic: 'transactions',
      messages: [{ value: JSON.stringify(req.body) }]
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(5000);
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await Alert.find().sort({ createdAt: -1 }).limit(5000);
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalTx = await Transaction.countDocuments();
    const totalAlerts = await Alert.countDocuments();
    const criticalAlerts = await Alert.countDocuments({ riskLevel: 'CRITICAL' });
    const pendingAlerts = await Alert.countDocuments({ status: 'PENDING' });
    
    res.json({
      success: true,
      data: {
        totalTransactions: totalTx,
        totalAlerts: totalAlerts,
        criticalAlerts: criticalAlerts,
        pendingAlerts: pendingAlerts,
        alertRate: totalTx > 0 ? ((totalAlerts / totalTx) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/alerts/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { action, comments, assignedTo } = req.body;
    
    const alert = await Alert.findOneAndUpdate(
      { alertId },
      {
        status: action,
        action,
        comments,
        assignedTo,
        reviewedAt: new Date()
      },
      { new: true }
    );
    
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== PASSWORD PROTECTED CLEANUP ENDPOINT ====================
app.delete('/api/cleanup/all', async (req, res) => {
  try {
    const { password } = req.body;
    const CLEANUP_PASSWORD = '140301'; // Password: 140301
    
    // Verify password
    if (!password) {
      return res.status(401).json({ 
        success: false, 
        message: 'Password required',
        error: 'MISSING_PASSWORD'
      });
    }
    
    if (password !== CLEANUP_PASSWORD) {
      console.log(`❌ Failed cleanup attempt with wrong password at ${new Date().toISOString()}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid password',
        error: 'INVALID_PASSWORD'
      });
    }
    
    const timestamp = new Date().toISOString();
    console.log(`🗑️  Database cleanup requested by sukshamrainaa at ${timestamp}`);
    console.log(`🔐 Password verified successfully`);
    
    // Drop all collections
    const deletedTransactions = await Transaction.deleteMany({});
    const deletedAlerts = await Alert.deleteMany({});
    
    // Get counts to verify
    const txCount = await Transaction.countDocuments();
    const alertCount = await Alert.countDocuments();
    
    console.log('✅ Database cleaned successfully');
    console.log(`   Deleted: ${deletedTransactions.deletedCount} transactions, ${deletedAlerts.deletedCount} alerts`);
    console.log(`   Remaining: ${txCount} transactions, ${alertCount} alerts`);
    
    res.json({ 
      success: true, 
      message: 'Database cleaned successfully',
      user: 'sukshamrainaa',
      timestamp: timestamp,
      deleted: {
        transactions: deletedTransactions.deletedCount,
        alerts: deletedAlerts.deletedCount
      },
      remaining: {
        transactions: txCount,
        alerts: alertCount
      }
    });
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Advanced Fraud Detection API',
    user: 'sukshamrainaa',
    version: '3.2.0',
    modelVersion: 'v3.2.0',
    alertThreshold: '0.4 (40%)',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🔥 Backend running on port ${PORT}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
});