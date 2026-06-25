const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Handling koneksi MongoDB untuk Serverless (Vercel)
let isConnected;
const connectDB = async () => {
    if (isConnected) return;
    const db = await mongoose.connect(process.env.MONGODB_URI);
    isConnected = db.connections[0].readyState;
};

// Skema Database MongoDB
const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    text: String,
    timestamp: String,
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// Middleware Koneksi DB
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Fungsi Kirim Telegram (Aman di Backend)
const sendTelegram = async (text) => {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text: text
        });
    } catch (err) { console.error("Telegram Error:", err.message); }
};

// --- ROUTES ---

// Notifikasi Umum (Saat user baru masuk)
app.post('/api/notify', async (req, res) => {
    const { message } = req.body;
    await sendTelegram(message);
    res.json({ success: true });
});

// Kirim Pesan
app.post('/api/send', async (req, res) => {
    const { sender, receiver, text } = req.body;
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    await Message.create({ sender, receiver, text, timestamp });

    // Notif Telegram kalau yang ngechat bukan admin
    if (sender !== 'admin') {
        await sendTelegram(`🚨 TEROR BARU MASUK!\n\n👻 Korban: ${sender}\n💬 Pesan: ${text}`);
    }
    res.json({ status: "success" });
});

// Ambil Pesan
app.get('/api/messages', async (req, res) => {
    const { user } = req.query;
    const messages = await Message.find({
        $or: [
            { sender: user, receiver: 'admin' },
            { sender: 'admin', receiver: user }
        ]
    }).sort({ createdAt: 1 });

    const formatted = messages.map(m => ({
        id: m._id, sender: m.sender, receiver: m.receiver, text: m.text, timestamp: m.timestamp
    }));
    res.json(formatted);
});

// Ambil Daftar Korban
app.get('/api/users', async (req, res) => {
    const users = await Message.distinct('sender', { sender: { $ne: 'admin' } });
    res.json(users);
});

// Hapus Pesan
app.delete('/api/delete', async (req, res) => {
    await Message.findByIdAndDelete(req.query.id);
    res.json({ status: "deleted" });
});

// Autentikasi Admin Sederhana
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === (process.env.ADMIN_PASSWORD || 'admin123')) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Akses ditolak!' });
    }
});

// Wajib untuk Vercel Serverless
module.exports = app;
