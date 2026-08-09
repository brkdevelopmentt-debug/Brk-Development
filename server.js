const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const JWT_SECRET = 'brk_devs_super_secret_key_2026';

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Veritabanı
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('DB Bağlantı Hatası:', err);
    else console.log('SQLite Veritabanı Hazır.');
});

function generateUniqueApiKey() {
    return 'brk_live_' + crypto.randomBytes(16).toString('hex');
}

const defaultBotNames = [
    "Ahmet_Kaya", "Mehmet_Yilmaz", "Ali_Vural", "Can_Demir", "Ege_Yildiz",
    "Burak_Sahin", "Emre_Aydin", "Mert_Kilic", "Ozan_Kaya", "Serkan_Acar",
    "Kerem_Tekin", "Tolga_Cevik", "Batuhan_Arslan", "Volkan_Yildirim", "Ozgur_Celik"
];

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE COLLATE NOCASE,
        password TEXT,
        role TEXT DEFAULT 'uye',
        server_ip TEXT DEFAULT '',
        cfx_link TEXT DEFAULT '',
        max_bots INTEGER DEFAULT 0,
        used_bots INTEGER DEFAULT 0,
        expiry_date TEXT DEFAULT '',
        balance REAL DEFAULT 0.0,
        api_key TEXT DEFAULT '',
        bot_names TEXT DEFAULT ''
    )`);

    const defaultPass = bcrypt.hashSync('admin123', 10);
    const adminKey = generateUniqueApiKey();
    
    db.run(`INSERT OR IGNORE INTO users (username, password, role, api_key, bot_names) VALUES ('admin', ?, 'superadmin', ?, ?)`, 
        [defaultPass, adminKey, JSON.stringify(defaultBotNames)]);
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Oturum açmanız gerekiyor!' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Geçersiz token!' });
        req.user = user;
        next();
    });
}

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Oturum açmanız gerekiyor!' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err || user.role !== 'superadmin') {
            return res.status(403).json({ error: 'Bu işlem için superadmin yetkisi gereklidir!' });
        }
        req.user = user;
        next();
    });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/api/bot/server-sync', (req, res) => {
    const apiKey = req.query.key;
    if (!apiKey) return res.status(400).json({ error: 'API Key eksik!' });

    db.get(`SELECT used_bots, bot_names FROM users WHERE api_key = ?`, [apiKey], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Geçersiz API Key!' });

        let names = [];
        try { names = JSON.parse(user.bot_names || '[]'); } catch (e) { names = defaultBotNames; }
        const activeNames = names.slice(0, user.used_bots);

        res.json({ success: true, botCount: user.used_bots, botNames: activeNames });
    });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Tüm alanları doldurunuz!' });

    const cleanUser = username.trim();
    db.get(`SELECT id FROM users WHERE LOWER(username) = LOWER(?)`, [cleanUser], (err, existingUser) => {
        if (err) return res.status(500).json({ error: 'Veritabanı hatası!' });
        if (existingUser) return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanılıyor!' });

        const hash = bcrypt.hashSync(password, 10);
        const lowerUser = cleanUser.toLowerCase();
        const initialRole = (lowerUser === 'berke' || lowerUser === 'admin') ? 'superadmin' : 'uye';
        const userApiKey = generateUniqueApiKey();

        db.run(`INSERT INTO users (username, password, role, api_key, bot_names) VALUES (?, ?, ?, ?, ?)`, 
            [cleanUser, hash, initialRole, userApiKey, JSON.stringify(defaultBotNames)], function(err) {
            if (err) return res.status(500).json({ error: 'Kayıt başarısız!' });
            const token = jwt.sign({ id: this.lastID, username: cleanUser, role: initialRole }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ success: true, token, user: { id: this.lastID, username: cleanUser, role: initialRole }, message: 'Kayıt başarılı!' });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir!' });

    const cleanUser = username.trim();
    db.get(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`, [cleanUser], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı!' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role }, message: 'Giriş başarılı!' });
    });
});

app.get('/api/me', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        res.json(user);
    });
});

app.post('/api/bot/start', authenticateToken, (req, res) => {
    const { count } = req.body;
    const botCount = parseInt(count);
    if (isNaN(botCount) || botCount <= 0) return res.status(400).json({ error: 'Geçerli bir sayı giriniz!' });

    db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        if (user.max_bots === 0) return res.status(400).json({ error: 'Aktif bot paketiniz bulunmuyor!' });
        if (botCount > user.max_bots) return res.status(400).json({ error: `En fazla ${user.max_bots} bot başlatabilirsiniz!` });

        db.run(`UPDATE users SET used_bots = ? WHERE id = ?`, [botCount, user.id], function(err) {
            if (err) return res.status(500).json({ error: 'Bot durumu güncellenemedi.' });
            res.json({ success: true, message: `${botCount} adet bot aktif edildi.` });
        });
    });
});

app.post('/api/bot/stop', authenticateToken, (req, res) => {
    db.run(`UPDATE users SET used_bots = 0 WHERE id = ?`, [req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Botlar durdurulamadı.' });
        res.json({ success: true, message: 'Tüm botlar durduruldu.' });
    });
});

app.post('/api/admin/add-balance', authenticateAdmin, (req, res) => {
    const { username, amount } = req.body;
    const addAmount = parseFloat(amount);
    if (!username || isNaN(addAmount) || addAmount <= 0) return res.status(400).json({ error: 'Geçerli tutar girin!' });

    db.get(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`, [username.trim()], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        const newBalance = (user.balance || 0) + addAmount;
        db.run(`UPDATE users SET balance = ? WHERE id = ?`, [newBalance, user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Bakiye yüklenemedi!' });
            res.json({ success: true, message: `${user.username} kullanıcısına ${addAmount}€ eklendi.` });
        });
    });
});

app.post('/api/admin/set-package', authenticateAdmin, (req, res) => {
    const { username, maxBots, expiryDate } = req.body;
    const botCount = parseInt(maxBots);
    if (!username || isNaN(botCount) || !expiryDate) return res.status(400).json({ error: 'Tüm alanları doldurunuz!' });

    db.get(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`, [username.trim()], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        db.run(`UPDATE users SET max_bots = ?, expiry_date = ? WHERE id = ?`, [botCount, expiryDate, user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Paket tanımlanamadı!' });
            res.json({ success: true, message: `${user.username} hesabına paket tanımlandı.` });
        });
    });
});

app.post('/api/user/buy-package', authenticateToken, (req, res) => {
    const price = 10.0; 
    const defaultBots = 50;

    db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        if ((user.balance || 0) < price) return res.status(400).json({ error: 'Yetersiz bakiye!' });

        const newBalance = user.balance - price;
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 30);
        const formattedDate = expDate.toISOString().split('T')[0];

        db.run(`UPDATE users SET balance = ?, max_bots = ?, expiry_date = ? WHERE id = ?`, 
            [newBalance, defaultBots, formattedDate, user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Satın alma işlemi başarısız!' });
            res.json({ success: true, message: 'Paket başarıyla satın alındı!' });
        });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
    console.log(`[Brk Development] Sunucu http://localhost:${PORT} adresinde aktif.`);
});