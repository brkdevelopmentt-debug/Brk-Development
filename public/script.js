document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    async function loadUserData() {
        try {
            const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }
            const user = await res.json();
            
            // Verileri Yazdır
            if (document.getElementById('lblUsername')) document.getElementById('lblUsername').innerText = user.username;
            if (document.getElementById('lblBalance')) document.getElementById('lblBalance').innerText = (user.balance || 0).toFixed(2) + ' €';
            if (document.getElementById('displayApiKey')) document.getElementById('displayApiKey').innerText = user.api_key || 'Yok';
            if (document.getElementById('displayMaxBots')) document.getElementById('displayMaxBots').innerText = user.max_bots;
            if (document.getElementById('displayActiveBots')) document.getElementById('displayActiveBots').innerText = user.used_bots;

            // Admin Paneli Gizle/Göster
            const adminBlock = document.getElementById('adminPanelBlock');
            if (adminBlock) {
                adminBlock.style.display = (user.role === 'superadmin') ? 'block' : 'none';
            }
        } catch (e) { console.error(e); }
    }

    // Bot Başlat
    const btnStart = document.getElementById('btnStartBot');
    if (btnStart) btnStart.addEventListener('click', async () => {
        const count = document.getElementById('botCountInput').value;
        const res = await fetch('/api/bot/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ count })
        });
        const data = await res.json();
        alert(data.message || data.error);
        loadUserData();
    });

    // Bot Durdur
    const btnStop = document.getElementById('btnStopBot');
    if (btnStop) btnStop.addEventListener('click', async () => {
        const res = await fetch('/api/bot/stop', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        alert(data.message || data.error);
        loadUserData();
    });

    // Satın Al
    const btnBuy = document.getElementById('btnBuyPackage');
    if (btnBuy) btnBuy.addEventListener('click', async () => {
        const res = await fetch('/api/user/buy-package', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        alert(data.message || data.error);
        loadUserData();
    });

    // Admin Paket
    const btnSetPkg = document.getElementById('btnAdminSetPackage');
    if (btnSetPkg) btnSetPkg.addEventListener('click', async () => {
        const username = document.getElementById('adminPackageUser').value;
        const maxBots = document.getElementById('adminPackageBots').value;
        const expiryDate = document.getElementById('adminPackageDate').value;
        const res = await fetch('/api/admin/set-package', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ username, maxBots, expiryDate })
        });
        const data = await res.json();
        alert(data.message || data.error);
        loadUserData();
    });

    // Admin Bakiye
    const btnAddBal = document.getElementById('btnAdminAddBalance');
    if (btnAddBal) btnAddBal.addEventListener('click', async () => {
        const username = document.getElementById('adminBalanceUser').value;
        const amount = document.getElementById('adminBalanceAmount').value;
        const res = await fetch('/api/admin/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ username, amount })
        });
        const data = await res.json();
        alert(data.message || data.error);
        loadUserData();
    });

    loadUserData();
});