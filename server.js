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

// Ana dizine girildiğinde otomatik login.html'e yönlendir
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// SQLite Veritabanı Kurulumu
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

    // Varsayılan Süper Admin (admin / admin123)
    const defaultPass = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', ?, 'superadmin')`, [defaultPass]);
});

// TOKEN DOĞRULAMA MIDDLEWARE
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Erişim yetkisi yok!' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş oturum!' });
        req.user = user;
        next();
    });
}

// KAYIT OL
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Lütfen tüm alanları doldurun!' });
    }

    if (password.length < 6 || password.length > 24) {
        return res.status(400).json({ error: 'Şifre minimum 6, maksimum 24 karakter olmalıdır!' });
    }

    const hash = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, 'uye')`, [username, hash], function(err) {
        if (err) return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış!' });
        res.json({ success: true, message: 'Kayıt başarılı! Giriş yapabilirsiniz.' });
    });
});

// GİRİŞ YAP
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı!' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { username: user.username, role: user.role }, message: 'Giriş başarılı! Yönlendiriliyorsunuz...' });
    });
});

// BİLGİ GETİR
app.get('/api/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, username, role, server_ip, cfx_link, max_bots, used_bots, expiry_date FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
        res.json(user);
    });
});

// ADMIN ROL ATAMA
app.post('/api/admin/set-role', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Bu işlem için yetkiniz yok!' });
    }
    const { targetUsername, newRole } = req.body;

    if (req.user.role === 'admin' && newRole === 'superadmin') {
        return res.status(403).json({ error: 'Admin kullanıcılar Süper Admin yetkisi veremez!' });
    }

    db.run(`UPDATE users SET role = ? WHERE username = ?`, [newRole, targetUsername], function(err) {
        if (err) return res.status(500).json({ error: 'Veritabanı hatası!' });
        res.json({ success: true, message: `${targetUsername} kullanıcısının rolü ${newRole} olarak güncellendi.` });
    });
});

// ADMIN TÜM KULLANICILAR
app.get('/api/admin/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }
    db.all(`SELECT id, username, role, server_ip, max_bots, expiry_date FROM users`, [], (err, rows) => {
        res.json(rows);
    });
});

// MÜŞTERİ SUNUCU BİLGİSİ
app.post('/api/user/update-server', authenticateToken, (req, res) => {
    const { server_ip, cfx_link } = req.body;
    db.run(`UPDATE users SET server_ip = ?, cfx_link = ? WHERE id = ?`, [server_ip, cfx_link, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: 'Güncellenemedi!' });
        res.json({ success: true, message: 'Sunucu bilgileri kaydedildi.' });
    });
});

// ADMIN BOT SÜRE TANIMLAMA
app.post('/api/admin/grant-bots', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Yetkisiz!' });
    const { targetUsername, max_bots, expiry_date } = req.body;
    
    db.run(`UPDATE users SET max_bots = ?, expiry_date = ?, role = 'musteri' WHERE username = ?`, [max_bots, expiry_date, targetUsername], (err) => {
        res.json({ success: true, message: 'Bot ve süre tanımlaması yapıldı.' });
    });
});

app.listen(PORT, () => console.log(`Brk Devs sunucusu ${PORT} portunda aktif.`));