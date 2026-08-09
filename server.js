const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Tüm ağ arayüzlerini dinler
const JWT_SECRET = 'brk_devs_super_secret_key_2026';

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Veritabanı
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('DB Bağlantı Hatası:', err);
    else console.log('SQLite Veritabanı Bağlantısı Başarılı.');
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
    if (!token) return res.status(401).json({ error: 'Oturum süresi doldu!' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Geçersiz token!' });
        req.user = user;
        next();
    });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// FIVEM SUNUCUSUNUN BOT VERİLERİNİ ÇEKTİĞİ ENDPOINT
app.get('/api/bot/server-sync', (req, res) => {
    const apiKey = req.query.key;
    if (!apiKey) return res.status(400).json({ error: 'API Key eksik!' });

    db.get(`SELECT used_bots, bot_names FROM users WHERE api_key = ?`, [apiKey], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Geçersiz API Key!' });

        let names = [];
        try {
            names = JSON.parse(user.bot_names || '[]');
        } catch (e) {
            names = defaultBotNames;
        }

        const activeNames = names.slice(0, user.used_bots);

        res.json({
            success: true,
            botCount: user.used_bots,
            botNames: activeNames
        });
    });
});

// KAYIT OL
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

// GİRİŞ YAP
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
    db.get(`SELECT id, username, role, server_ip, cfx_link, max_bots, used_bots, expiry_date, balance, api_key, bot_names FROM users WHERE id = ?`, [req.user.id], (err, user) => {
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, HOST, () => {
    console.log(`[Brk Dev] Sunucu http://localhost:${PORT} adresi üzerinde aktif.`);
});