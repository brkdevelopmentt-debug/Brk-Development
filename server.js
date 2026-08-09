const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'brk_devs_super_secret_key_2026';

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Veritabanı
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('DB Bağlantı Hatası:', err);
    else console.log('SQLite Veritabanı Hazır.');
});

// Tablo Oluşturma
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
        api_key TEXT DEFAULT ''
    )`);

    // Varsayılan Admin Hesapları
    const defaultPass = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', ?, 'superadmin')`, [defaultPass]);
    db.run(`UPDATE users SET role = 'superadmin' WHERE LOWER(username) IN ('berke', 'admin')`);
});

// JWT Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Oturum süresi doldu veya yetkisiz erişim!' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Geçersiz token!' });
        req.user = user;
        next();
    });
}

// Ana Dizin Yönlendirme
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// KAYIT OL (Register)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Lütfen tüm alanları doldurun!' });
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
        return res.status(400).json({ error: 'Kullanıcı adı 3-20 karakter arasında olmalıdır!' });
    }

    if (password.length < 6 || password.length > 24) {
        return res.status(400).json({ error: 'Şifre 6 ile 24 karakter arasında olmalıdır!' });
    }
    if (!/\d/.test(password)) {
        return res.status(400).json({ error: 'Şifre en az bir adet rakam içermelidir!' });
    }
    if (!/[a-zA-Z]/.test(password)) {
        return res.status(400).json({ error: 'Şifre en az bir adet harf içermelidir!' });
    }

    db.get(`SELECT id FROM users WHERE LOWER(username) = LOWER(?)`, [trimmedUsername], (err, existingUser) => {
        if (err) return res.status(500).json({ error: 'Veritabanı hatası!' });
        if (existingUser) {
            return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanılıyor!' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const lowerUser = trimmedUsername.toLowerCase();
        const initialRole = (lowerUser === 'berke' || lowerUser === 'admin') ? 'superadmin' : 'uye';

        db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [trimmedUsername, hash, initialRole], function(err) {
            if (err) return res.status(400).json({ error: 'Kullanıcı kaydı oluşturulamadı!' });
            
            const token = jwt.sign({ id: this.lastID, username: trimmedUsername, role: initialRole }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ success: true, token, message: 'Kayıt başarılı!' });
        });
    });
});

// GİRİŞ YAP (Login)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli!' });

    db.get(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`, [username.trim()], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı!' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { username: user.username, role: user.role }, message: 'Giriş başarılı!' });
    });
});

// KULLANICI BİLGİLERİNİ GETİR
app.get('/api/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, username, role, server_ip, cfx_link, max_bots, used_bots, expiry_date, balance, api_key FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        res.json(user);
    });
});

// SUNUCU AYARLARINI KAYDET
app.post('/api/user/update-server', authenticateToken, (req, res) => {
    const { server_ip, cfx_link } = req.body;
    
    // CFX Link düzeltme kontrolü
    let cleanCfx = cfx_link ? cfx_link.trim().replace('https://', '').replace('http://', '') : '';
    if (cleanCfx && !cleanCfx.includes('cfx.re/join/')) {
        if (cleanCfx.startsWith('cfx.rejoin')) {
            cleanCfx = cleanCfx.replace('cfx.rejoin', 'cfx.re/join/');
        }
    }

    db.run(`UPDATE users SET server_ip = ?, cfx_link = ? WHERE id = ?`, [server_ip || '', cleanCfx || '', req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Veritabanına kaydedilemedi!' });
        res.json({ success: true, message: 'Sunucu bilgileri başarıyla kaydedildi.' });
    });
});

// BOT BAŞLAT
app.post('/api/bot/start', authenticateToken, (req, res) => {
    const { count } = req.body;
    const botCount = parseInt(count);

    if (isNaN(botCount) || botCount <= 0) {
        return res.status(400).json({ error: 'Geçerli bir bot sayısı giriniz!' });
    }

    db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        
        if (user.max_bots === 0) {
            return res.status(400).json({ error: 'Aktif bot paketiniz bulunmuyor!' });
        }

        if (botCount > user.max_bots) {
            return res.status(400).json({ error: `En fazla ${user.max_bots} adet bot başlatabilirsiniz!` });
        }

        if (!user.api_key) {
            return res.status(400).json({ error: 'Hesabınıza atanmış bir API Key bulunmuyor! Lütfen Admin ile iletişime geçin.' });
        }

        if (!user.server_ip && !user.cfx_link) {
            return res.status(400).json({ error: 'Lütfen önce Sunucu IP veya CFX bağlantınızı kaydedin!' });
        }

        db.run(`UPDATE users SET used_bots = ? WHERE id = ?`, [botCount, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: 'Bot durumu güncellenemedi.' });

            console.log(`[BRK-BOT] ${user.username} - API Key: ${user.api_key} -> ${botCount} Bot Gönderiliyor... Target: ${user.cfx_link || user.server_ip}`);

            res.json({ success: true, message: `${botCount} adet bot sunucuya yönlendiriliyor...` });
        });
    });
});

// BOT DURDUR
app.post('/api/bot/stop', authenticateToken, (req, res) => {
    db.run(`UPDATE users SET used_bots = 0 WHERE id = ?`, [req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Botlar durdurulamadı.' });
        res.json({ success: true, message: 'Tüm botlar durduruldu.' });
    });
});

// PAKET SATIN AL
app.post('/api/user/buy-package', authenticateToken, (req, res) => {
    const { bots, days, totalPrice } = req.body;
    db.get(`SELECT balance FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        if (user.balance < totalPrice) {
            return res.status(400).json({ error: 'Yetersiz bakiye! Lütfen EUR bakiyesi yükleyin.' });
        }
        
        const newBalance = user.balance - totalPrice;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(days));
        const formattedDate = expiryDate.toISOString().split('T')[0];

        db.run(`UPDATE users SET balance = ?, max_bots = ?, expiry_date = ?, role = 'musteri' WHERE id = ?`, 
            [newBalance, bots, formattedDate, req.user.id], function(err) {
                if (err) return res.status(500).json({ error: 'Satın alım işlemi başarısız.' });
                res.json({ success: true, message: 'Paket başarıyla satın alındı ve hesabınıza tanımlandı!' });
        });
    });
});

// ADMIN: API KEY OLUŞTUR / ATAMA
app.post('/api/admin/generate-apikey', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    const { targetUsername } = req.body;
    if (!targetUsername) return res.status(400).json({ error: 'Kullanıcı adı giriniz!' });

    // 32 Karakterlik Rastgele API Key Üretme (örn: brk_live_a1b2c3d4e5f6...)
    const newApiKey = 'brk_live_' + crypto.randomBytes(16).toString('hex');

    db.run(`UPDATE users SET api_key = ? WHERE LOWER(username) = LOWER(?)`, [newApiKey, targetUsername.trim()], function(err) {
        if (err || this.changes === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        res.json({ success: true, apiKey: newApiKey, message: `${targetUsername} kullanıcısına yeni API Key atandı.` });
    });
});

// ADMIN: ROL DEĞİŞTİR
app.post('/api/admin/set-role', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Yetkisiz erişim!' });
    const { targetUsername, newRole } = req.body;
    db.run(`UPDATE users SET role = ? WHERE LOWER(username) = LOWER(?)`, [newRole, targetUsername.trim()], function(err) {
        if (err || this.changes === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        res.json({ success: true, message: `${targetUsername} kullanıcısının rolü ${newRole} olarak güncellendi.` });
    });
});

// ADMIN: BOT VE SÜRE TANIMLA
app.post('/api/admin/grant-bots', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Yetkisiz erişim!' });
    const { targetUsername, max_bots, expiry_date } = req.body;
    db.run(`UPDATE users SET max_bots = ?, expiry_date = ?, role = 'musteri' WHERE LOWER(username) = LOWER(?)`, [max_bots, expiry_date, targetUsername.trim()], function(err) {
        if (err || this.changes === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        res.json({ success: true, message: 'Bot ve süre kullanıcıya atandı.' });
    });
});

// ADMIN: BAKİYE YÜKLE
app.post('/api/admin/add-balance', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Yetkisiz erişim!' });
    const { targetUsername, amount } = req.body;
    db.run(`UPDATE users SET balance = balance + ? WHERE LOWER(username) = LOWER(?)`, [amount, targetUsername.trim()], function(err) {
        if (err || this.changes === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        res.json({ success: true, message: `${targetUsername} hesabına ${amount} EUR eklendi.` });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => console.log(`Brk Dev sunucusu ${PORT} portunda çalışıyor.`));