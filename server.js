const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

let currentApiKey = "brk_live_pgtphi2bts";
let activeBotCount = 0;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

app.get('/api/bot-names', (req, res) => {
    const clientKey = req.headers['authorization'];
    
    if (clientKey !== currentApiKey) {
        return res.status(401).json({ success: false, message: 'Geçersiz API Key!' });
    }

    const filePath = path.join(__dirname, 'bot_names.txt');
    let namesData = '';
    if (fs.existsSync(filePath)) {
        namesData = fs.readFileSync(filePath, 'utf8');
    }

    res.json({ 
        success: true, 
        botCount: activeBotCount,
        names: namesData 
    });
});

app.post('/api/set-bot-count', (req, res) => {
    const { count } = req.body;
    activeBotCount = parseInt(count) || 0;
    res.json({ success: true, count: activeBotCount });
});

app.get('/api/get-panel-bot-names', (req, res) => {
    const filePath = path.join(__dirname, 'bot_names.txt');
    const names = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    res.json({ success: true, names: names });
});

app.post('/api/save-bot-names', (req, res) => {
    const { names } = req.body;
    const filePath = path.join(__dirname, 'bot_names.txt');
    fs.writeFile(filePath, names, (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'Bot isimleri başarıyla güncellendi!' });
    });
});

app.listen(port, () => console.log(`[Brk Development] Sunucu aktif: ${port}`));