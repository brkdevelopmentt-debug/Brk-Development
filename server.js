const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sayfa Yönlendirmeleri
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Bot İsimlerini Getir
app.get('/api/bot-names', (req, res) => {
    const filePath = path.join(__dirname, 'bot_names.txt');
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        res.json({ success: true, names: data });
    } else {
        res.json({ success: true, names: '' });
    }
});

// Bot İsimlerini Kaydet
app.post('/api/save-bot-names', (req, res) => {
    const { names } = req.body;
    const filePath = path.join(__dirname, 'bot_names.txt');
    
    fs.writeFile(filePath, names, (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'İsimler kaydedilemedi.' });
        }
        res.json({ success: true, message: 'Bot isimleri başarıyla güncellendi!' });
    });
});

app.listen(port, () => {
    console.log(`[Brk Development] Sunucu aktif: ${port}`);
});