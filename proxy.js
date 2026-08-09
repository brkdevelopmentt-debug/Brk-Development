const http = require('http');
const sqlite3 = require('sqlite3').verbose();

const PROXY_PORT = 30120; // Dışarıya açık FiveM Portu
const FXSERVER_PORT = 30121; // Gerçek FXServer Portu

const db = new sqlite3.Database('./database.sqlite');

function getActiveBotsFromDB(callback) {
    db.all(`SELECT used_bots, bot_names FROM users WHERE used_bots > 0`, [], (err, rows) => {
        if (err || !rows) return callback([]);
        
        let allBots = [];
        let botIdCounter = 8000;

        rows.forEach(row => {
            let names = [];
            try {
                names = JSON.parse(row.bot_names || '[]');
            } catch (e) {
                names = ["Ahmet_Kaya", "Mehmet_Yilmaz", "Ali_Vural", "Can_Demir"];
            }

            const activeForUser = names.slice(0, row.used_bots);
            activeForUser.forEach(name => {
                botIdCounter++;
                allBots.push({
                    endpoint: "127.0.0.1",
                    id: botIdCounter,
                    identifiers: [
                        `license:bot_${botIdCounter}`,
                        `live:bot_${botIdCounter}`
                    ],
                    name: name,
                    ping: Math.floor(Math.random() * 30) + 15
                });
            });
        });

        callback(allBots);
    });
}

const server = http.createServer((req, res) => {
    // /players.json İSTEĞİNİ YAKALA VE BOTLARI EKLE
    if (req.url === '/players.json') {
        http.get(`http://127.0.0.1:${FXSERVER_PORT}/players.json`, (fxRes) => {
            let body = '';
            fxRes.on('data', chunk => body += chunk);
            fxRes.on('end', () => {
                let realPlayers = [];
                try {
                    realPlayers = JSON.parse(body);
                } catch (e) {
                    realPlayers = [];
                }

                getActiveBotsFromDB((bots) => {
                    const combined = [...realPlayers, ...bots];
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify(combined));
                });
            });
        }).on('error', () => {
            res.writeHead(500);
            res.end('[]');
        });
        return;
    }

    // /dynamic.json İSTEĞİNİ YAKALA VE SAYIYI YÜKSELT
    if (req.url === '/dynamic.json') {
        http.get(`http://127.0.0.1:${FXSERVER_PORT}/dynamic.json`, (fxRes) => {
            let body = '';
            fxRes.on('data', chunk => body += chunk);
            fxRes.on('end', () => {
                try {
                    let dynamicData = JSON.parse(body);
                    getActiveBotsFromDB((bots) => {
                        dynamicData.clients = (parseInt(dynamicData.clients) || 0) + bots.length;
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify(dynamicData));
                    });
                } catch (e) {
                    res.writeHead(500);
                    res.end('{}');
                }
            });
        }).on('error', () => {
            res.writeHead(500);
            res.end('{}');
        });
        return;
    }

    // DİĞER TÜM İSTEKLERİ DOĞRUDAN FXSERVER'A YÖNLENDİR
    const proxyReq = http.request({
        host: '127.0.0.1',
        port: FXSERVER_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers
    }, (fxRes) => {
        res.writeHead(fxRes.statusCode, fxRes.headers);
        fxRes.pipe(res, { end: true });
    });

    req.pipe(proxyReq, { end: true });
});

server.listen(PROXY_PORT, () => {
    console.log(`[Brk Proxy] Bot Query Enjektörü ${PROXY_PORT} portunda aktif.`);
});