// Initialize Lucide icons
lucide.createIcons();

// Global State
let ghnData = null;
let ghnMaterialsData = null;
let charts = {};

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz2Wjnj5WwPMF6RRlEmAEBNORMr9HFNuA_zb1FarczdLc0kl-4wV5um_UtwmH6OqNAr/exec';

// Chart.js Global Defaults for Dark Theme
Chart.defaults.color = '#9ba1b0';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.font.family = "'Inter', sans-serif";

// Navigation Logic
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Update active nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        
        // Show target module
        const targetId = item.getAttribute('data-target');
        document.querySelectorAll('.module-section').forEach(s => s.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
    });
});

// Load Data (From global variable)
async function fetchOnlineMaterials() {
    try {
        const response = await fetch(APPS_SCRIPT_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const apiData = await response.json();
        
        // Transform API data to match dashboard format
        const transformedData = {
            allocations: (apiData.allocations || []).map(item => ({
                date: item.date === '01/01/1970' ? 'N/A' : item.date,
                postOffice: item.bc || 'N/A',
                item: item.item || 'N/A',
                quantity: item.sl || 0,
                unit: item.unit || 'N/A',
                location: item.dest || 'N/A'
            })),
            forklifts: (apiData.forkliftLogs || []).map(item => ({
                supplier: item.provider || 'N/A',
                code: item.id || 'N/A',
                issueTime: item.issueDate === '01/01/1970' ? 'N/A' : item.issueDate,
                issueType: item.issueType || 'N/A',
                fixTime: item.fixDate === '01/01/1970' ? '' : item.fixDate,
                note: item.note || ''
            })),
            purchases: window.ghnMaterialsConfig ? window.ghnMaterialsConfig.purchases : [] // Keep offline purchases
        };
        
        console.log('Online data fetched and transformed successfully');
        return transformedData;
    } catch (error) {
        console.error('Failed to fetch online materials:', error);
        return null;
    }
}

async function loadData() {
    try {
        // Try to load online data first
        const onlineMaterials = await fetchOnlineMaterials();
        
        ghnData = window.ghnDataConfig;
        
        if (onlineMaterials) {
            ghnMaterialsData = onlineMaterials;
            console.log('Using online materials data');
        } else {
            ghnMaterialsData = window.ghnMaterialsConfig || { allocations: [] };
            console.warn("Using offline fallback data for materials");
        }
        
        // Hide loading, show dashboard
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('dashboard-content').classList.remove('hidden');
        
        initDashboard();
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').innerHTML = '<span style="color: #ef4444">Lỗi tải dữ liệu. Vui lòng kiểm tra lại file.</span>';
    }
}

function initDashboard() {
    renderKPIs();
    renderTrendChart();
    renderProvinceChart();
    renderHeatmapTable();
    renderAMChart();
    if (ghnMaterialsData) {
        if (ghnMaterialsData.allocations && ghnMaterialsData.allocations.length > 0) {
            renderMaterialsTable();
            initMaterialsSearch();
        }
        if (ghnMaterialsData.forklifts && ghnMaterialsData.forklifts.length > 0) {
            renderForkliftsTable();
            initForkliftsSearch();
        }
        if (ghnMaterialsData.purchases && ghnMaterialsData.purchases.length > 0) {
            renderPurchasesTable();
            initPurchasesSearch();
        }
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat('vi-VN').format(Math.round(num));
}

function renderKPIs() {
    document.getElementById('kpi-total-orders').textContent = formatNumber(ghnData.summary.totalOrders);
    document.getElementById('kpi-total-weight').textContent = formatNumber(ghnData.summary.totalWeight);
    document.getElementById('kpi-total-pos').textContent = ghnData.summary.activePostOffices;
    document.getElementById('kpi-total-ams').textContent = ghnData.ams.length;
}

function renderTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    // Aggregate daily data
    const dailyOrders = new Array(7).fill(0);
    const dailyWeight = new Array(7).fill(0);
    
    ghnData.postOffices.forEach(po => {
        po.history.forEach((dayData, i) => {
            if (i < 7) {
                dailyOrders[i] += dayData.orders;
                dailyWeight[i] += dayData.weight;
            }
        });
    });

    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ghnData.metadata.dates,
            datasets: [{
                label: 'Sản lượng Lấy (Đơn)',
                data: dailyOrders,
                borderColor: '#f26522',
                backgroundColor: 'rgba(242, 101, 34, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                yAxisID: 'y'
            }, {
                label: 'Khối lượng (Kg)',
                data: dailyWeight,
                borderColor: '#d92518',
                borderDash: [5, 5],
                borderWidth: 2,
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: { type: 'linear', display: true, position: 'left' },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}

function renderProvinceChart() {
    const ctx = document.getElementById('provinceChart').getContext('2d');
    
    // Aggregate by province
    const provinceMap = {};
    ghnData.postOffices.forEach(po => {
        if (!provinceMap[po.province]) provinceMap[po.province] = 0;
        provinceMap[po.province] += po.totalOrders;
    });

    const labels = Object.keys(provinceMap);
    const data = Object.values(provinceMap);

    charts.province = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#f26522',
                    '#d92518',
                    '#f59e0b',
                    '#10b981',
                    '#8b5cf6'
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            cutout: '70%'
        }
    });
}

function renderHeatmapTable() {
    const tbody = document.querySelector('#poTable tbody');
    tbody.innerHTML = '';
    
    // Sort by utilization rate descending (most critical first)
    const sortedPOs = [...ghnData.postOffices]
        .filter(po => po.capacity > 0) // Only show ones with known capacity
        .sort((a, b) => b.utilizationRate - a.utilizationRate)
        .slice(0, 50); // Show top 50 for performance

    sortedPOs.forEach(po => {
        let statusClass = 'safe';
        let statusText = 'An toàn';
        
        if (po.utilizationRate >= 90) {
            statusClass = 'critical';
            statusText = 'Quá tải';
        } else if (po.utilizationRate >= 70) {
            statusClass = 'warning';
            statusText = 'Cảnh báo';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${po.name}</strong>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">ID: ${po.id}</div>
            </td>
            <td>
                ${po.district}
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${po.province}</div>
            </td>
            <td>${po.am}</td>
            <td class="text-right" style="font-weight: 600;">${formatNumber(po.volMet)}</td>
            <td class="text-right">${formatNumber(po.capacity)}</td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">
                    ${statusText} (${Math.round(po.utilizationRate)}%)
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAMChart() {
    const ctx = document.getElementById('amChart').getContext('2d');
    
    // Sort AMs by total orders
    const sortedAMs = [...ghnData.ams]
        .sort((a, b) => b.totalOrders - a.totalOrders)
        .slice(0, 10); // Top 10

    charts.am = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedAMs.map(am => am.name),
            datasets: [{
                label: 'Sản Lượng Xử Lý',
                data: sortedAMs.map(am => am.totalOrders),
                backgroundColor: '#f26522',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#poTable tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
});

function renderMaterialsTable(searchTerm = '') {
    const tbody = document.querySelector('#materialsTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Reverse sort to show newest first, assuming data order is chronological
    const allocations = [...ghnMaterialsData.allocations].reverse();
    
    allocations.forEach(item => {
        // Simple search filter
        const searchableText = `${item.date} ${item.postOffice} ${item.item} ${item.location}`.toLowerCase();
        if (searchTerm && !searchableText.includes(searchTerm.toLowerCase())) return;

        let statusClass = 'neutral';
        if (item.location && item.location.toLowerCase() === 'bc') statusClass = 'safe';
        if (item.location && item.location.toLowerCase() === 'kho') statusClass = 'warning';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="white-space: nowrap;">${item.date}</td>
            <td><strong>${item.postOffice}</strong></td>
            <td>${item.item}</td>
            <td class="text-right" style="font-weight: 600; color: var(--text-primary);">${item.quantity}</td>
            <td class="text-center">${item.unit}</td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">
                    ${item.location || 'N/A'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function initMaterialsSearch() {
    const searchInput = document.getElementById('searchMaterials');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderMaterialsTable(e.target.value);
        });
    }
}

function renderForkliftsTable(searchTerm = '') {
    const tbody = document.querySelector('#forkliftsTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Sort logic (optional): we can assume they are chronological, or we reverse
    const forklifts = [...(ghnMaterialsData.forklifts || [])].reverse();
    
    forklifts.forEach(item => {
        // Simple search filter
        const searchableText = `${item.code} ${item.supplier} ${item.issueType} ${item.note}`.toLowerCase();
        if (searchTerm && !searchableText.includes(searchTerm.toLowerCase())) return;

        let statusClass = 'neutral';
        let statusText = 'Đang xử lý';
        if (item.fixTime) {
            statusClass = 'safe';
            statusText = 'Đã khắc phục';
        } else {
            statusClass = 'critical';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.code}</strong></td>
            <td>${item.supplier}</td>
            <td>${item.issueType}</td>
            <td class="text-center">${item.issueTime}</td>
            <td class="text-center">${item.fixTime || '-'}</td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">
                    ${statusText}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function initForkliftsSearch() {
    const searchInput = document.getElementById('searchForklifts');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderForkliftsTable(e.target.value);
        });
    }
}

function renderPurchasesTable(searchTerm = '') {
    const tbody = document.querySelector('#purchasesTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const purchases = [...(ghnMaterialsData.purchases || [])].reverse();
    
    purchases.forEach(item => {
        const searchableText = `${item.itemName} ${item.itemCode}`.toLowerCase();
        if (searchTerm && !searchableText.includes(searchTerm.toLowerCase())) return;

        let statusClass = 'neutral';
        let statusText = 'Đang giao';
        
        // Simple logic for status: if receive date is not empty and is valid, might be received
        if (item.receiveDate) {
            statusClass = 'safe';
            statusText = 'Đã nhận';
        } else {
            statusClass = 'warning';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.itemName}</strong></td>
            <td>${item.itemCode}</td>
            <td class="text-right" style="font-weight: 600; color: var(--text-primary);">${item.quantity}</td>
            <td class="text-center">${item.orderDate || '-'}</td>
            <td class="text-center">${item.receiveDate || '-'}</td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td class="text-center">
                ${item.link ? `<a href="${item.link}" target="_blank" style="color: var(--ghn-orange); text-decoration: none;"><i data-lucide="external-link" style="width: 16px; height: 16px;"></i></a>` : '-'}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Re-init lucide icons for the new external links
    lucide.createIcons();
}

function initPurchasesSearch() {
    const searchInput = document.getElementById('searchPurchases');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderPurchasesTable(e.target.value);
        });
    }
}

// Start app
loadData();
