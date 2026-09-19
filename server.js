const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Gerekli Middleware'ler
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // dashboard.html gibi dosyaları buradan okur

// Veritabanı niyetine kullanılacak JSON dosyaları
const dataFilePath = path.join(__dirname, 'data.json');
const usersFilePath = path.join(__dirname, 'users.json');

// Sunucu başlarken dosyalar yoksa otomatik oluşturur
if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify({ botCount: 0, names: "" }));
}
if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify({})); // Kullanıcı verileri boş obje başlar
}

// ==========================================
// 1. FİVEM BOT KONTROL ENDPOINTLERİ
// ==========================================

// Bot verilerini okuma (FiveM server.lua buraya istek atar)
app.get('/api/bot-names', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        res.json({ success: true, ...data });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Veri okuma hatası' });
    }
});

// Bot verilerini güncelleme (Dashboard'dan bot sayısı ayarlandığında çalışır)
app.post('/api/bot-names', (req, res) => {
    const { botCount, names } = req.body;
    try {
        fs.writeFileSync(dataFilePath, JSON.stringify({ botCount, names }, null, 2));
        res.json({ success: true, message: 'Bot verileri başarıyla güncellendi.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Veri yazma hatası' });
    }
});

// ==========================================
// 2. ADMİN PANELİ / KULLANICI LİMİT KONTROLÜ
// ==========================================

// Kayıtlı üyeleri ve limitlerini getirme
app.get('/api/get-users', (req, res) => {
    try {
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        res.json({ success: true, users: usersData });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Kullanıcı verisi okuma hatası' });
    }
});

// Admin tarafından üye limitini güncelleme
app.post('/api/update-user-limit', (req, res) => {
    const { email, limit } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, error: 'Lütfen bir e-posta adresi belirtin.' });
    }

    try {
        // Mevcut kullanıcıları oku
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        
        // Kullanıcı yoksa oluştur
        if (!usersData[email]) {
            usersData[email] = {};
        }
        
        // Limiti güncelle ve dosyaya yaz
        usersData[email].botLimit = parseInt(limit) || 0;
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
        
        res.json({ success: true, message: `${email} adresi için bot limiti ${limit} olarak kaydedildi.` });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Kullanıcı limiti güncellenirken hata oluştu.' });
    }
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`[Brk-Development] Web paneli aktif: Port ${PORT}`);
});