const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET_KEY = "lux_dev_api_secret_key_change_this";
const db = new sqlite3.Database('./database.db');

// Tabloları Hazırla
db.serialize(() => {
    // Kullanıcılar
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT -- 'superadmin', 'admin', 'customer'
    )`);

    // Lisanslar (API Keys)
    db.run(`CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT UNIQUE,
        user_id INTEGER,
        bot_limit INTEGER,
        active_bots INTEGER DEFAULT 0,
        custom_names TEXT DEFAULT '',
        expires_at INTEGER, -- Timestamp (ms)
        created_at INTEGER
    )`);

    // Varsayılan Superadmin oluştur (Kullanıcı: admin / Şifre: admin123)
    const hash = bcrypt.hashSync("admin123", 10);
    db.run(`INSERT OR IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', ?, 'superadmin')`, [hash]);
});

// Middleware
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: "Yetkisiz erişim" });
    jwt.verify(token.replace('Bearer ', ''), SECRET_KEY, (err, decoded) => {
        if (err) return res.status(500).json({ error: "Geçersiz Oturum" });
        req.user = decoded;
        next();
    });
};

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: "Hatalı kullanıcı adı veya şifre!" });
        }
        const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, SECRET_KEY);
        res.json({ token, role: user.role, username: user.username });
    });
});

// Admin: Yeni API Key Üret (1 Ay, 3 Ay, 1 Yıl)
app.post('/api/admin/generate-key', verifyToken, (req, res) => {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Yetkiniz yok!" });
    }

    const { target_username, bot_limit, duration_months } = req.body;
    
    // Kullanıcı kontrol/oluşturma
    db.get(`SELECT id FROM users WHERE username = ?`, [target_username], (err, user) => {
        let userId = user ? user.id : null;
        
        const createLicense = (uid) => {
            const apiKey = "LUX-" + crypto.randomBytes(8).toString('hex').toUpperCase();
            const now = Date.now();
            const durationMs = duration_months * 30 * 24 * 60 * 60 * 1000;
            const expiresAt = now + durationMs;

            db.run(`INSERT INTO licenses (api_key, user_id, bot_limit, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
                [apiKey, uid, bot_limit, now, expiresAt],
                function(err) {
                    if (err) return res.status(500).json({ error: "Key oluşturulamadı." });
                    res.json({ success: true, api_key: apiKey, expires_at: new Date(expiresAt).toLocaleDateString("tr-TR") });
                }
            );
        };

        if (!userId) {
            const defaultPass = bcrypt.hashSync("123456", 10);
            db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, 'customer')`, [target_username, defaultPass], function(err) {
                createLicense(this.lastID);
            });
        } else {
            createLicense(userId);
        }
    });
});

// Kayıt Olma (Register) Endpoint
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Kullanıcı adı ve şifre gereklidir!" });

    const hash = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, 'customer')`, [username, hash], function(err) {
        if (err) return res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış!" });
        res.json({ success: true, message: "Kayıt başarılı." });
    });
});

// Müşteri: Bot Ayarlarını Güncelle (Slider & İsimler)
app.post('/api/customer/update', verifyToken, (req, res) => {
    const { active_bots, custom_names } = req.body;

    db.get(`SELECT * FROM licenses WHERE user_id = ? AND expires_at > ?`, [req.user.id, Date.now()], (err, license) => {
        if (!license) return res.status(404).json({ error: "Aktif lisansınız bulunamadı veya süresi dolmuş!" });

        if (active_bots > license.bot_limit) {
            return res.status(400).json({ error: `Atanan bot sayısı lisans limitinizi (${license.bot_limit}) aşamaz!` });
        }

        db.run(`UPDATE licenses SET active_bots = ?, custom_names = ? WHERE id = ?`, [active_bots, custom_names, license.id], (err) => {
            if (err) return res.status(500).json({ error: "Ayarlar kaydedilemedi." });
            res.json({ success: true, message: "Bot ayarları başarıyla güncellendi!" });
        });
    });
});

// Müşteri: Lisans ve Bot Bilgilerini Çek
app.get('/api/customer/info', verifyToken, (req, res) => {
    db.get(`SELECT * FROM licenses WHERE user_id = ? AND expires_at > ?`, [req.user.id, Date.now()], (err, license) => {
        if (!license) return res.json({ has_license: false });
        res.json({
            has_license: true,
            api_key: license.api_key,
            bot_limit: license.bot_limit,
            active_bots: license.active_bots,
            custom_names: license.custom_names,
            expires_at: new Date(license.expires_at).toLocaleDateString("tr-TR")
        });
    });
});

// FiveM / RedM Script API (Script'in sorguladığı endpoint)
app.get('/api/v1/fetch-bots', (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) return res.status(401).json({ error: "API Key eksik!" });

    db.get(`SELECT * FROM licenses WHERE api_key = ?`, [apiKey], (err, license) => {
        if (!license) return res.status(403).json({ error: "Geçersiz API Key!" });

        if (Date.now() > license.expires_at) {
            return res.status(403).json({ error: "Lisans süreniz dolmuştur!" });
        }

        let nameList = license.custom_names ? license.custom_names.split(',').map(n => n.trim()) : [];
        res.json({
            status: "active",
            active_bots: license.active_bots,
            names: nameList
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Panel ${PORT} portunda aktif.`));