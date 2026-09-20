const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS paketine ihtiyaç duymadan Express dâhilî CORS izni (Render/Node çökmesini engeller)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.static('public')); // public klasöründeki dosyaları (index.html, dashboard.html vs.) dışarı sunar

// Veritabanı niyetine kullanılacak JSON dosya yolları
const dataFilePath = path.join(__dirname, 'data.json');
const usersFilePath = path.join(__dirname, 'users.json');

// Sunucu başladığında dosyalar yoksa otomatik sıfır veriyle oluşturur
if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify({ botCount: 0, names: "" }, null, 2));
}
if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify({}, null, 2));
}

// =========================================================
// 1. FİVEM SCRIPT (server.lua) İÇİN BOT APİ ENDPOINTLERİ
// =========================================================

// Bot verilerini oku (FiveM scripti buraya GET isteği atar)
app.get('/api/bot-names', (req, res) => {
    try {
        if (fs.existsSync(dataFilePath)) {
            const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8') || '{}');
            res.json({ success: true, ...data });
        } else {
            res.json({ success: true, botCount: 0, names: "" });
        }
    } catch (error) {
        console.error("Bot verisi okuma hatası:", error);
        res.status(500).json({ success: false, error: 'Bot verileri okunamadı.' });
    }
});

// Bot verilerini güncelle (Dashboard üzerinden bot sayısı/isimleri kaydedildiğinde çalışır)
app.post('/api/bot-names', (req, res) => {
    const { botCount, names } = req.body;
    try {
        const newData = {
            botCount: parseInt(botCount) || 0,
            names: names || ""
        };
        fs.writeFileSync(dataFilePath, JSON.stringify(newData, null, 2));
        res.json({ success: true, message: 'Bot ayarları başarıyla güncellendi.' });
    } catch (error) {
        console.error("Bot verisi yazma hatası:", error);
        res.status(500).json({ success: false, error: 'Bot verileri kaydedilemedi.' });
    }
});

// =========================================================
// 2. ADMİN PANELİ VE ÜYE LİMİT KONTROL APİ ENDPOINTLERİ
// =========================================================

// Tüm kayıtlı üyeleri ve limitlerini getir
app.get('/api/get-users', (req, res) => {
    try {
        if (fs.existsSync(usersFilePath)) {
            const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8') || '{}');
            res.json({ success: true, users: usersData });
        } else {
            res.json({ success: true, users: {} });
        }
    } catch (error) {
        console.error("Kullanıcı verisi okuma hatası:", error);
        res.status(500).json({ success: false, error: 'Kullanıcı listesi okunamadı.' });
    }
});

// Admin panelinden bir üyenin bot limitini güncelle
app.post('/api/update-user-limit', (req, res) => {
    const { email, limit } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, error: 'Lütfen geçerli bir e-posta adresi belirtin.' });
    }

    try {
        let usersData = {};
        if (fs.existsSync(usersFilePath)) {
            usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8') || '{}');
        }
        
        if (!usersData[email]) {
            usersData[email] = {};
        }
        
        usersData[email].botLimit = parseInt(limit) || 0;
        usersData[email].updatedAt = new Date().toISOString();

        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
        res.json({ 
            success: true, 
            message: `${email} hesabı için yeni bot limiti (${limit}) kaydedildi.` 
        });
    } catch (error) {
        console.error("Limit güncelleme hatası:", error);
        res.status(500).json({ success: false, error: 'Üye limiti güncellenirken hata oluştu.' });
    }
});

// =========================================================
// SUNUCU BAŞLATMA
// =========================================================
app.listen(PORT, () => {
    console.log(`[Brk-Development] Web paneli başarıyla aktif edildi! Port: ${PORT}`);
});