// Initialize Lucide icons
lucide.createIcons();

// Global State
let ghnData = null;
let ghnMaterialsData = null;
let charts = {};

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwQWBAoL1zyBZ3v33EtXTChgLK1STa1rzcGdMcwbhExeBNH6As9BjphfX0SRbk67Twf/exec';

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
        // Timeout sau 10 giây để tránh treo vô thời hạn
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(APPS_SCRIPT_URL, { 
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error('Network response was not ok');
        const apiData = await response.json();
        
        // Transform API data to match dashboard format
        const transformedData = {
            allocations: (apiData.allocations || []).map(item => {
                let displayDate = item.date;
                if (!displayDate || displayDate === '01/01/1970' || displayDate === 'N/A') {
                    // Fallback to updated date if possible
                    displayDate = apiData.updated ? new Date(apiData.updated).toLocaleDateString('vi-VN') : 'Mới nhất';
                }
                return {
                    date: displayDate,
                    postOffice: item.bc || 'N/A',
                    item: item.item || 'N/A',
                    quantity: item.sl || 0,
                    unit: item.unit || 'N/A',
                    location: item.dest || 'N/A',
                    issuer: item.issuer || 'N/A'
                };
            }),
            forklifts: (apiData.forkliftLogs || []).map(item => ({
                supplier: item.provider || 'N/A',
                code: item.id || 'N/A',
                issueTime: item.issueDate === '01/01/1970' ? 'N/A' : item.issueDate,
                issueType: item.issueType || 'N/A',
                fixTime: item.fixDate === '01/01/1970' ? '' : item.fixDate,
                note: item.note || ''
            })),
            purchases: window.ghnMaterialsConfig ? window.ghnMaterialsConfig.purchases : [], // Keep offline purchases
            infraHealth: (apiData.infraHealth || []).map(item => ({
                date: item.date || 'N/A',
                group: item.group || 'N/A',
                item: item.item || 'N/A',
                status: item.status || 'N/A',
                desc: item.desc || '',
                action: item.action || '-',
                inspector: item.inspector || 'N/A'
            }))
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
    initMapSearch(); // New function
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
        
        // Render Infra Health even with mock data for now
        renderInfraHealthModule();
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
            <td class="text-center"><span style="font-size: 11px; padding: 2px 6px; background: rgba(255,255,255,0.05); border-radius: 4px;">${po.type}</span></td>
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
        const searchableText = `${item.date} ${item.postOffice} ${item.item} ${item.location} ${item.issuer}`.toLowerCase();
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
            <td class="text-center" style="font-weight: 500; color: var(--accent-primary);">${item.issuer || 'N/A'}</td>
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

// --- INFRA HEALTH MODULE (Module 8) ---
function renderInfraHealthModule() {
    // 1. Use real data if available and not empty, otherwise fallback to mock data
    let infraData = [];
    if (ghnMaterialsData && ghnMaterialsData.infraHealth && ghnMaterialsData.infraHealth.length > 0) {
        infraData = ghnMaterialsData.infraHealth;
    } else {
        infraData = [
            // Kết cấu xây dựng
            { group: 'Kết cấu xây dựng', item: 'Mái tôn khu A', status: 'Khá', action: 'Theo dõi dột' },
            { group: 'Kết cấu xây dựng', item: 'Mái tôn khu B', status: 'Tốt', action: '-' },
            { group: 'Kết cấu xây dựng', item: 'Sơn vạch kẻ đường', status: 'Khá', action: 'Lên kế hoạch sơn dặm' },
            { group: 'Kết cấu xây dựng', item: 'Rào chắn bảo vệ', status: 'Trung bình', action: 'Sơn lại các chỗ rỉ sét' },
            { group: 'Kết cấu xây dựng', item: 'Sàn bê tông khu xuất hàng', status: 'Tốt', action: '-' },
            { group: 'Kết cấu xây dựng', item: 'Cửa cuốn tự động', status: 'Khá', action: 'Bảo dưỡng motor' },
            // Hệ thống điện
            { group: 'Hệ thống điện', item: 'Đèn LED highbay', status: 'Tốt', action: '-' },
            { group: 'Hệ thống điện', item: 'Tủ điện tổng MSB', status: 'Trung bình', action: 'Bảo trì định kỳ, kiểm tra nhiệt độ' },
            { group: 'Hệ thống điện', item: 'Hệ thống tiếp địa', status: 'Tốt', action: '-' },
            { group: 'Hệ thống điện', item: 'Dây cáp điện khu phân loại', status: 'Khá', action: 'Kiểm tra độ võng' },
            { group: 'Hệ thống điện', item: 'Máy phát điện dự phòng', status: 'Trung bình', action: 'Thay dầu nhớt định kỳ' },
            { group: 'Hệ thống điện', item: 'Ổ cắm công nghiệp', status: 'Tốt', action: '-' },
            // PCCC
            { group: 'PCCC', item: 'Sprinkler khu B', status: 'Kém', action: 'Thay thế 3 đầu phun bị rỉ sét' },
            { group: 'PCCC', item: 'Đèn khẩn cấp khu C', status: 'Kém', action: 'Thay pin backup ngay lập tức' },
            { group: 'PCCC', item: 'Bình chữa cháy', status: 'Khá', action: 'Kiểm tra áp suất định kỳ' },
            { group: 'PCCC', item: 'Hệ thống báo cháy tự động', status: 'Tốt', action: '-' },
            { group: 'PCCC', item: 'Máy bơm chữa cháy', status: 'Trung bình', action: 'Chạy thử nghiệm tuần tới' },
            { group: 'PCCC', item: 'Họng nước vách tường', status: 'Tốt', action: '-' },
            // Thiết bị vận hành
            { group: 'Thiết bị vận hành', item: 'Băng chuyền chính', status: 'Tốt', action: '-' },
            { group: 'Thiết bị vận hành', item: 'Xe nâng điện', status: 'Trung bình', action: 'Kiểm tra bình ắc quy' },
            { group: 'Thiết bị vận hành', item: 'Kệ trung tải', status: 'Tốt', action: '-' },
            { group: 'Thiết bị vận hành', item: 'Cân điện tử', status: 'Khá', action: 'Hiệu chuẩn lại cảm biến' },
            { group: 'Thiết bị vận hành', item: 'Băng chuyền nhánh A', status: 'Khá', action: 'Tra dầu mỡ motor' },
            { group: 'Thiết bị vận hành', item: 'Cửa Dock Leveler số 3', status: 'Kém', action: 'Thay thế ty thủy lực bị xì dầu' },
            // CNTT & An ninh
            { group: 'CNTT & An ninh', item: 'Camera ngoài trời', status: 'Khá', action: 'Vệ sinh ống kính' },
            { group: 'CNTT & An ninh', item: 'Mạng LAN nội bộ', status: 'Trung bình', action: 'Thay cáp mốc, tối ưu switch' },
            { group: 'CNTT & An ninh', item: 'Server lưu trữ', status: 'Tốt', action: '-' },
            { group: 'CNTT & An ninh', item: 'Thiết bị phát Wifi', status: 'Tốt', action: '-' },
            { group: 'CNTT & An ninh', item: 'Máy in mã vạch', status: 'Trung bình', action: 'Vệ sinh đầu in' },
            { group: 'CNTT & An ninh', item: 'Cổng từ an ninh', status: 'Khá', action: 'Căn chỉnh lại độ nhạy' },
            // HVAC
            { group: 'HVAC', item: 'Quạt đối lưu', status: 'Tốt', action: '-' },
            { group: 'HVAC', item: 'Điều hòa tủ đứng', status: 'Khá', action: 'Bơm ga, làm sạch màng lọc' },
            { group: 'HVAC', item: 'Quạt hút mái', status: 'Trung bình', action: 'Thay bạc đạn do kêu to' },
            { group: 'HVAC', item: 'Hệ thống thông gió khu B', status: 'Tốt', action: '-' },
            { group: 'HVAC', item: 'Máy lạnh văn phòng', status: 'Tốt', action: '-' }
        ];
    }

    // Groups definition
    const groupsInfo = {
        'Kết cấu xây dựng': { icon: 'building', id: 'Xây dựng' },
        'Hệ thống điện': { icon: 'zap', id: 'Điện' },
        'PCCC': { icon: 'flame', id: 'PCCC' },
        'Thiết bị vận hành': { icon: 'settings', id: 'Vận hành' },
        'CNTT & An ninh': { icon: 'shield-check', id: 'CNTT' },
        'HVAC': { icon: 'wind', id: 'HVAC' }
    };

    // Calculate stats
    let totalItems = infraData.length;
    let redItems = [];
    
    let groupStats = {};
    Object.keys(groupsInfo).forEach(g => {
        groupStats[g] = { total: 0, good: 0, fair: 0, bad: 0, critical: 0 };
    });

    let overall = { good: 0, fair: 0, bad: 0, critical: 0 };

    infraData.forEach(item => {
        let gName = item.group;
        if (!groupStats[gName]) return;
        
        groupStats[gName].total++;
        let st = item.status.toLowerCase();
        
        if (st === 'tốt') { groupStats[gName].good++; overall.good++; }
        else if (st === 'khá') { groupStats[gName].fair++; overall.fair++; }
        else if (st === 'trung bình' || st === 'tb') { groupStats[gName].bad++; overall.bad++; }
        else if (st === 'kém') { 
            groupStats[gName].critical++; 
            overall.critical++; 
            redItems.push(item);
        }
    });

    // 2. Render Alert Banner
    const alertBanner = document.getElementById('infra-alert-banner');
    if (redItems.length > 0) {
        alertBanner.classList.remove('hidden');
        alertBanner.querySelector('span').textContent = `CẢNH BÁO: Phát hiện ${redItems.length} hạng mục ĐỎ cần xử lý khẩn cấp trong 48h!`;
    } else {
        alertBanner.classList.add('hidden');
    }

    // 3. Render KPI Cards
    const kpiContainer = document.getElementById('infra-kpi-container');
    kpiContainer.innerHTML = '';

    Object.keys(groupsInfo).forEach(gName => {
        const stats = groupStats[gName];
        let healthScore = 100;
        if (stats.total > 0) {
            healthScore = Math.round(((stats.good + stats.fair) / stats.total) * 100);
        }

        let scoreClass = 'score-green';
        let bgClass = 'bg-green';
        let trendHtml = '<i data-lucide="trending-up" class="score-green"></i> <span>Tốt lên</span>';

        if (healthScore < 40 || stats.critical > 0) {
            scoreClass = 'score-red'; bgClass = 'bg-red';
            trendHtml = '<i data-lucide="alert-triangle" class="score-red"></i> <span class="score-red">⚠ KHẨN</span>';
        } else if (healthScore < 60) {
            scoreClass = 'score-orange'; bgClass = 'bg-orange';
            trendHtml = '<i data-lucide="trending-down" class="score-orange"></i> <span>Giảm</span>';
        } else if (healthScore < 80) {
            scoreClass = 'score-yellow'; bgClass = 'bg-yellow';
            trendHtml = '<i data-lucide="minus" class="score-yellow"></i> <span>Ổn định</span>';
        } else {
            trendHtml = '<i data-lucide="check-circle" class="score-green"></i> <span>Ổn định</span>';
        }

        const card = document.createElement('div');
        card.className = 'infra-card glass-panel';
        card.innerHTML = `
            <div class="infra-card-header">
                <h3>${groupsInfo[gName].id}</h3>
                <div class="${bgClass}" style="padding: 6px; border-radius: 8px; display: flex;">
                    <i data-lucide="${groupsInfo[gName].icon}"></i>
                </div>
            </div>
            <div class="infra-card-body">
                <span class="infra-score ${scoreClass}">${healthScore}%</span>
            </div>
            <div class="infra-trend">
                ${trendHtml}
            </div>
        `;
        kpiContainer.appendChild(card);
    });

    // 4. Render Chart
    const ctx = document.getElementById('infraHealthChart');
    if (ctx && charts.infraHealth) {
        charts.infraHealth.destroy();
    }
    
    if (ctx) {
        charts.infraHealth = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Tốt (Xanh)', 'Khá (Vàng)', 'Trung bình (Cam)', 'Kém (Đỏ)'],
                datasets: [{
                    data: [overall.good, overall.fair, overall.bad, overall.critical],
                    backgroundColor: ['#10b981', '#f59e0b', '#f26522', '#ef4444'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#9ba1b0', font: { family: "'Inter', sans-serif" } }
                    }
                }
            }
        });
    }

    // 5. Render Urgent Table
    const tbody = document.querySelector('#infraUrgentTable tbody');
    if (tbody) {
        tbody.innerHTML = '';
        
        // Sort items: Red -> Orange -> Yellow -> Green
        const statusWeight = { 'kém': 4, 'trung bình': 3, 'tb': 3, 'khá': 2, 'tốt': 1 };
        const sortedItems = [...infraData].sort((a, b) => {
            return (statusWeight[b.status.toLowerCase()] || 0) - (statusWeight[a.status.toLowerCase()] || 0);
        }).slice(0, 10); // Top 10

        sortedItems.forEach(item => {
            let st = item.status.toLowerCase();
            let badgeClass = 'neutral';
            
            if (st === 'kém') badgeClass = 'critical';
            else if (st === 'trung bình' || st === 'tb') badgeClass = 'warning';
            else if (st === 'khá') badgeClass = 'warning'; // Can use a yellow class if defined, but warning is orange
            else if (st === 'tốt') badgeClass = 'safe';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${groupsInfo[item.group] ? groupsInfo[item.group].id : item.group}</strong></td>
                <td>${item.item}</td>
                <td class="text-center">
                    <span class="status-badge ${badgeClass}">${item.status}</span>
                </td>
                <td>${item.action || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 6. Trend Analysis (Kỳ trước vs Kỳ này)
    renderTrendAnalysis(infraData);

    // Refresh icons for new elements
    lucide.createIcons();
}

function renderTrendAnalysis(currentData) {
    // 1. Dữ liệu giả lập của kỳ trước (Tuần 19 - 09/05/2026)
    const previousData = [
        // Kết cấu xây dựng
        { group: 'Kết cấu xây dựng', item: 'Mái tôn khu A', status: 'Tốt' }, // Rớt xuống Khá (-1)
        { group: 'Kết cấu xây dựng', item: 'Mái tôn khu B', status: 'Tốt' }, 
        { group: 'Kết cấu xây dựng', item: 'Sơn vạch kẻ đường', status: 'Tốt' }, // Rớt xuống Khá (-1)
        { group: 'Kết cấu xây dựng', item: 'Rào chắn bảo vệ', status: 'Khá' }, // Rớt xuống Trung bình (-1)
        
        // Hệ thống điện
        { group: 'Hệ thống điện', item: 'Tủ điện tổng MSB', status: 'Tốt' }, // 🚩 Rớt từ Tốt -> Trung bình (-2) Fast Drop!
        { group: 'Hệ thống điện', item: 'Đèn LED highbay', status: 'Tốt' }, 
        { group: 'Hệ thống điện', item: 'Dây cáp điện khu phân loại', status: 'Tốt' }, // Rớt xuống Khá (-1)
        
        // PCCC
        { group: 'PCCC', item: 'Sprinkler khu B', status: 'Khá' }, // 🚩 Rớt từ Khá -> Kém (-2) Fast Drop!
        { group: 'PCCC', item: 'Đèn khẩn cấp khu C', status: 'Trung bình' }, // Rớt từ Trung bình -> Kém (-1)
        { group: 'PCCC', item: 'Bình chữa cháy', status: 'Tốt' }, // Rớt từ Tốt -> Khá (-1)
        
        // Thiết bị vận hành
        { group: 'Thiết bị vận hành', item: 'Xe nâng điện', status: 'Tốt' }, // 🚩 Rớt từ Tốt -> Trung bình (-2) Fast Drop!
        { group: 'Thiết bị vận hành', item: 'Cân điện tử', status: 'Tốt' }, // Rớt từ Tốt -> Khá (-1)
        { group: 'Thiết bị vận hành', item: 'Cửa Dock Leveler số 3', status: 'Khá' }, // 🚩 Rớt từ Khá -> Kém (-2) Fast Drop!
        
        // CNTT & An ninh
        { group: 'CNTT & An ninh', item: 'Mạng LAN nội bộ', status: 'Tốt' }, // 🚩 Rớt từ Tốt -> Trung bình (-2) Fast Drop!
        { group: 'CNTT & An ninh', item: 'Camera ngoài trời', status: 'Tốt' }, // Rớt từ Tốt -> Khá (-1)
        
        // HVAC
        { group: 'HVAC', item: 'Điều hòa tủ đứng', status: 'Tốt' }, // Rớt từ Tốt -> Khá (-1)
        { group: 'HVAC', item: 'Quạt hút mái', status: 'Tốt' } // 🚩 Rớt từ Tốt -> Trung bình (-2) Fast Drop!
    ];

    // Hệ điểm
    const getScore = (status) => {
        const s = status.toLowerCase();
        if (s === 'tốt') return 4;
        if (s === 'khá') return 3;
        if (s === 'trung bình' || s === 'tb') return 2;
        if (s === 'kém') return 1;
        return 4; // Mặc định Tốt nếu không có dữ liệu
    };

    // 2. Tính toán điểm tổng thể cho biểu đồ so sánh 2 kỳ
    const groupsInfo = {
        'Kết cấu xây dựng': 'Xây dựng', 'Hệ thống điện': 'Điện', 'PCCC': 'PCCC',
        'Thiết bị vận hành': 'Vận hành', 'CNTT & An ninh': 'CNTT', 'HVAC': 'HVAC'
    };
    
    let prevStats = { 'Kết cấu xây dựng': { total:0, max:0 }, 'Hệ thống điện': { total:0, max:0 }, 'PCCC': { total:0, max:0 }, 'Thiết bị vận hành': { total:0, max:0 }, 'CNTT & An ninh': { total:0, max:0 }, 'HVAC': { total:0, max:0 } };
    let currStats = { 'Kết cấu xây dựng': { total:0, max:0 }, 'Hệ thống điện': { total:0, max:0 }, 'PCCC': { total:0, max:0 }, 'Thiết bị vận hành': { total:0, max:0 }, 'CNTT & An ninh': { total:0, max:0 }, 'HVAC': { total:0, max:0 } };

    // Điểm kỳ trước
    previousData.forEach(item => {
        if(prevStats[item.group]) {
            prevStats[item.group].total += getScore(item.status);
            prevStats[item.group].max += 4;
        }
    });
    // Điểm kỳ này
    currentData.forEach(item => {
        if(currStats[item.group]) {
            currStats[item.group].total += getScore(item.status);
            currStats[item.group].max += 4;
        }
    });

    const labels = [];
    const prevDataArr = [];
    const currDataArr = [];
    
    Object.keys(groupsInfo).forEach(group => {
        labels.push(groupsInfo[group]);
        
        const prevPerc = prevStats[group].max > 0 ? Math.round((prevStats[group].total / prevStats[group].max) * 100) : 100; // Giả sử 100% nếu ko có lỗi
        prevDataArr.push(prevPerc);
        
        const currPerc = currStats[group].max > 0 ? Math.round((currStats[group].total / currStats[group].max) * 100) : 100;
        currDataArr.push(currPerc);
    });

    // 3. Render biểu đồ Bar Chart
    const trendCtx = document.getElementById('trendAnalysisChart');
    if (trendCtx) {
        if (window.charts && window.charts.trendAnalysis) {
            window.charts.trendAnalysis.destroy();
        }
        if(!window.charts) window.charts = {};
        
        window.charts.trendAnalysis = new Chart(trendCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Tuần 19 (Trước)',
                        data: prevDataArr,
                        backgroundColor: '#4ade80', // Màu xanh nhạt
                        borderRadius: 4
                    },
                    {
                        label: 'Tuần 20 (Này)',
                        data: currDataArr,
                        backgroundColor: currDataArr.map((val, idx) => val < prevDataArr[idx] ? '#f59e0b' : '#10b981'), // Cam nếu tuột hạng
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { color: '#9ba1b0', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#9ba1b0' }, grid: { display: false } }
                },
                plugins: {
                    legend: { labels: { color: '#9ba1b0', font: { family: "'Inter', sans-serif" } } }
                }
            }
        });
    }

    // 4. Lọc hạng mục đang xuống cấp (Delta < 0)
    let degradationList = [];
    let fastDropCount = 0;

    currentData.forEach(currItem => {
        const prevItem = previousData.find(p => p.group === currItem.group && p.item === currItem.item);
        if (prevItem) {
            const currScore = getScore(currItem.status);
            const prevScore = getScore(prevItem.status);
            const delta = currScore - prevScore;
            
            if (delta < 0) {
                degradationList.push({
                    group: currItem.group,
                    item: currItem.item,
                    prevStatus: prevItem.status,
                    currStatus: currItem.status,
                    delta: delta
                });
                if (delta <= -2) {
                    fastDropCount++;
                }
            }
        }
    });

    // Sắp xếp theo mức độ rớt hạng (rớt nhiều xếp trước)
    degradationList.sort((a, b) => a.delta - b.delta);

    // Cập nhật Badge báo đỏ
    const badge = document.getElementById('fast-degrade-badge');
    if (badge) {
        if (fastDropCount > 0) {
            badge.textContent = `${fastDropCount} rớt hạng nhanh`;
            badge.classList.remove('hidden');
            badge.style.display = 'inline-block';
        } else {
            badge.classList.add('hidden');
        }
    }

    // Cập nhật Bảng Trend Alert
    const tbody = document.querySelector('#trendAlertTable tbody');
    if (tbody) {
        tbody.innerHTML = '';
        if (degradationList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--text-muted)">Không có hạng mục nào xuống cấp so với tuần trước.</td></tr>`;
        } else {
            degradationList.forEach(item => {
                let statusBadgeClass = 'warning';
                let alertText = `<span style="color: var(--ghn-orange);">📉 Đang đi xuống (${item.delta})</span>`;
                
                if (item.delta <= -2) {
                    alertText = `<span style="color: var(--ghn-red); font-weight: bold;"><i data-lucide="alert-triangle" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>XUỐNG CẤP NHANH (${item.delta})</span>`;
                }

                // Màu kỳ này
                let currBadgeClass = 'warning';
                if (item.currStatus.toLowerCase() === 'kém') currBadgeClass = 'critical';

                const tr = document.createElement('tr');
                if (item.delta <= -2) tr.className = 'fast-drop-row';
                
                tr.innerHTML = `
                    <td><strong>${groupsInfo[item.group] || item.group}</strong></td>
                    <td>${item.item}</td>
                    <td class="text-center"><span class="status-badge safe">${item.prevStatus}</span></td>
                    <td class="text-center">
                        <i data-lucide="arrow-right" style="width: 14px; height: 14px; color: var(--text-muted); margin-right: 8px; vertical-align: middle;"></i>
                        <span class="status-badge ${currBadgeClass}">${item.currStatus}</span>
                    </td>
                    <td>${alertText}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
}

// Map Search Logic
function initMapSearch() {
    const poList = document.getElementById('poList');
    const provList = document.getElementById('provList');
    const mapSearchPO = document.getElementById('mapSearchPO');
    const mapSearchProv = document.getElementById('mapSearchProv');
    const overlay = document.getElementById('mapDetailsOverlay');
    const closeBtn = document.getElementById('closeMapOverlay');

    if (!poList || !ghnData) return;

    // Populate datalists
    const pos = ghnData.postOffices;
    pos.forEach(po => {
        const opt = document.createElement('option');
        opt.value = po.name;
        poList.appendChild(opt);
    });

    const provinces = [...new Set(pos.map(po => po.province))].sort();
    provinces.forEach(prov => {
        const opt = document.createElement('option');
        opt.value = prov;
        provList.appendChild(opt);
    });

    // PO Search Event
    mapSearchPO.addEventListener('change', (e) => {
        const found = pos.find(p => p.name === e.target.value);
        if (found) {
            showMapOverlay(found);
        }
    });

    // Province Search Event
    mapSearchProv.addEventListener('change', (e) => {
        const provPOs = pos.filter(p => p.province === e.target.value);
        if (provPOs.length > 0) {
            showProvinceOverlay(e.target.value, provPOs);
        }
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    }
}

function showMapOverlay(po) {
    const overlay = document.getElementById('mapDetailsOverlay');
    if (!overlay) return;
    
    document.getElementById('overlayName').textContent = po.name;
    document.getElementById('overlayOrders').textContent = formatNumber(po.volMet);
    document.getElementById('overlayDistrict').textContent = po.district;
    document.getElementById('overlayProvince').textContent = po.province;
    document.getElementById('overlayAM').textContent = po.am;
    
    overlay.classList.remove('hidden');
}

function showProvinceOverlay(province, provPOs) {
    const overlay = document.getElementById('mapDetailsOverlay');
    if (!overlay) return;

    const totalOrders = provPOs.reduce((sum, p) => sum + p.volMet, 0);
    document.getElementById('overlayName').textContent = `Khu vực: ${province}`;
    document.getElementById('overlayOrders').textContent = formatNumber(totalOrders);
    document.getElementById('overlayDistrict').textContent = `${provPOs.length} Bưu cục`;
    document.getElementById('overlayProvince').textContent = province;
    document.getElementById('overlayAM').textContent = "Danh sách đa dạng";
    
    overlay.classList.remove('hidden');
}

// Start app
loadData();
