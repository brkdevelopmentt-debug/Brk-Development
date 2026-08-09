const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

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

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'uye',
        server_ip TEXT DEFAULT '',
        cfx_link TEXT DEFAULT '',
        max_bots INTEGER DEFAULT 0,
        used_bots INTEGER DEFAULT 0,
        expiry_date TEXT DEFAULT ''
    )`);
    db.serialize(() => {
    // ... tablo oluşturma kodları ...

    // 'KENDI_KULLANICI_ADINIZ' yazan yeri kendi kullanıcı adınızla değiştirin:
    db.run(`UPDATE users SET role = 'superadmin' WHERE username = 'Berke'`);
});

    const defaultPass = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', ?, 'superadmin')`, [defaultPass]);
});

// TOKEN DOĞRULAMA MIDDLEWARE
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Erişim yetkisi yok!' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Geçersiz token!' });
        req.user = user;
        next();
    });
}

// ANA DİZİN YÖNLENDİRMESİ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// REGISTER (KAYIT OL VE TOKEN DÖN)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Lütfen tüm alanları doldurun!' });
    if (password.length < 6 || password.length > 24) return res.status(400).json({ error: 'Şifre 6-24 karakter olmalı!' });

    const hash = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, 'uye')`, [username, hash], function(err) {
        if (err) return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış!' });
        
        // Kayıt başarılı olduğunda anında token üret
        const token = jwt.sign({ id: this.lastID, username, role: 'uye' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, message: 'Kayıt başarılı!' });
    });
});

// LOGIN (GİRİŞ)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı!' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { username: user.username, role: user.role }, message: 'Giriş başarılı!' });
    });
});

// KULLANICI BİLGİSİ
app.get('/api/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, username, role, server_ip, cfx_link, max_bots, used_bots, expiry_date FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        res.json(user);
    });
});

// SUNUCU GÜNCELLE
app.post('/api/user/update-server', authenticateToken, (req, res) => {
    const { server_ip, cfx_link } = req.body;
    db.run(`UPDATE users SET server_ip = ?, cfx_link = ? WHERE id = ?`, [server_ip, cfx_link, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: 'Güncellenemedi!' });
        res.json({ success: true, message: 'Sunucu bilgileri kaydedildi.' });
    });
});

// ROL ATAMA (ADMIN)
app.post('/api/admin/set-role', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Yetkisiz!' });
    const { targetUsername, newRole } = req.body;
    db.run(`UPDATE users SET role = ? WHERE username = ?`, [newRole, targetUsername], (err) => {
        res.json({ success: true, message: 'Rol güncellendi.' });
    });
});

// BOT & SÜRE TANIMLAMA (ADMIN)
app.post('/api/admin/grant-bots', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Yetkisiz!' });
    const { targetUsername, max_bots, expiry_date } = req.body;
    db.run(`UPDATE users SET max_bots = ?, expiry_date = ?, role = 'musteri' WHERE username = ?`, [max_bots, expiry_date, targetUsername], (err) => {
        res.json({ success: true, message: 'Bot ve süre tanımlandı.' });
    });
});

// DİĞER TÜM ADRESLERİ LOGIN'E SÜRÜKLE
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => console.log(`Brk Dev sunucusu ${PORT} portunda aktif.`));