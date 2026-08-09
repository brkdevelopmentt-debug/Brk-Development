document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Kullanıcı Bilgilerini Çekme
    async function loadUserData() {
        try {
            const res = await fetch('/api/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }

            const user = await res.json();

            document.getElementById('lblUsername').innerText = user.username;
            document.getElementById('lblBalance').innerText = (user.balance || 0).toFixed(2) + ' €';

            // Admin Değilse Admin Panelini Gizle
            const adminBlock = document.getElementById('adminPanelBlock');
            if (adminBlock) {
                adminBlock.style.display = (user.role === 'superadmin') ? 'block' : 'none';
            }
        } catch (e) {
            console.error('Kullanıcı verisi alınamadı:', e);
        }
    }

    // 1. BAKİYEYLE SATIN AL
    const btnBuyPackage = document.getElementById('btnBuyPackage');
    if (btnBuyPackage) {
        btnBuyPackage.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/user/buy-package', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await res.json();
                alert(data.message || data.error);
                if (data.success) loadUserData();
            } catch (err) {
                alert('İşlem sırasında hata oluştu!');
            }
        });
    }

    // 2. ADMIN: PAKET TANIMLA
    const btnAdminSetPackage = document.getElementById('btnAdminSetPackage');
    if (btnAdminSetPackage) {
        btnAdminSetPackage.addEventListener('click', async () => {
            const username = document.getElementById('adminPackageUser').value;
            const maxBots = document.getElementById('adminPackageBots').value;
            const expiryDate = document.getElementById('adminPackageDate').value;

            try {
                const res = await fetch('/api/admin/set-package', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ username, maxBots, expiryDate })
                });
                const data = await res.json();
                alert(data.message || data.error);
                if (data.success) loadUserData();
            } catch (err) {
                alert('Paket tanımlama hatası!');
            }
        });
    }

    // 3. ADMIN: BAKİYE YÜKLE
    const btnAdminAddBalance = document.getElementById('btnAdminAddBalance');
    if (btnAdminAddBalance) {
        btnAdminAddBalance.addEventListener('click', async () => {
            const username = document.getElementById('adminBalanceUser').value;
            const amount = document.getElementById('adminBalanceAmount').value;

            try {
                const res = await fetch('/api/admin/add-balance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ username, amount })
                });
                const data = await res.json();
                alert(data.message || data.error);
                if (data.success) loadUserData();
            } catch (err) {
                alert('Bakiye yükleme hatası!');
            }
        });
    }

    loadUserData();
});