// Initialize Lucide icons
lucide.createIcons();

// Global State
let ghnData = null;
let ghnMaterialsData = null;
let charts = {};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyj45EoU7IJjRq6r8hbe4RWmPFZB-CBxZiy7RuVPpOAPXYmOx83obvCO__LrE0CtHo0/exec'; // Auth API
const REPORT_API_URL  = 'https://script.google.com/macros/s/AKfycbzQB5zWptOlgE0Wt5pfhopMVN2GEZ18ConPuvT8HuRHXqUaJ1_nPV-MmmZk7Clxp-jo/exec'; // Data Báo Cáo
const CCDC_API_URL    = APPS_SCRIPT_URL; // Dùng chung Apps Script URL — chỉ cần deploy lại 1 lần


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
        
        const response = await fetch(REPORT_API_URL, { 
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
    renderOverviewSummaries();
    renderLayoutMap();
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
                <strong>${escapeHtml(po.name)}</strong>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">ID: ${escapeHtml(po.id)}</div>
            </td>
            <td>
                ${escapeHtml(po.district)}
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${escapeHtml(po.province)}</div>
            </td>
            <td>${escapeHtml(po.am)}</td>
            <td class="text-center"><span style="font-size: 11px; padding: 2px 6px; background: rgba(255,255,255,0.05); border-radius: 4px;">${escapeHtml(po.type)}</span></td>
            <td class="text-right" style="font-weight: 600;">${formatNumber(po.volMet)}</td>
            <td class="text-right">${formatNumber(po.capacity)}</td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">
                    ${escapeHtml(statusText)} (${Math.round(po.utilizationRate)}%)
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderOverviewSummaries() {
    // 1. Tóm tắt Vật tư cấp phát
    let totalAllocations = 0;
    let allocationsToPo = 0;
    
    if (ghnMaterialsData && ghnMaterialsData.allocations) {
        totalAllocations = ghnMaterialsData.allocations.length;
        allocationsToPo = ghnMaterialsData.allocations.filter(a => a.location && a.location.toLowerCase() === 'bc').length;
    }
    
    const matCardTotal = document.getElementById('summary-mat-total');
    const matCardPo = document.getElementById('summary-mat-po');
    if (matCardTotal) matCardTotal.textContent = totalAllocations;
    if (matCardPo) matCardPo.textContent = allocationsToPo;

    // 2. Tóm tắt Nhật ký Xe nâng
    let totalForkliftIssues = 0;
    let fixedIssues = 0;
    let pendingIssues = 0;
    
    if (ghnMaterialsData && ghnMaterialsData.forklifts) {
        totalForkliftIssues = ghnMaterialsData.forklifts.length;
        fixedIssues = ghnMaterialsData.forklifts.filter(f => f.fixTime && f.fixTime !== '' && f.fixTime !== '-').length;
        pendingIssues = totalForkliftIssues - fixedIssues;
    }
    
    const forkCardTotal = document.getElementById('summary-fork-total');
    const forkCardPending = document.getElementById('summary-fork-pending');
    if (forkCardTotal) forkCardTotal.textContent = totalForkliftIssues;
    if (forkCardPending) forkCardPending.textContent = pendingIssues;
    
    // Render Analysis Section
    renderAnalysisInsights();
    
    // Refresh icons inside the newly populated elements just in case
    lucide.createIcons();
}

function renderAnalysisInsights() {
    const forklifts = (ghnMaterialsData && ghnMaterialsData.forklifts) ? ghnMaterialsData.forklifts : [];
    const allocations = (ghnMaterialsData && ghnMaterialsData.allocations) ? ghnMaterialsData.allocations : [];

    // === PHÂN TÍCH XE NÂNG ===
    // Xe nào sự cố nhiều nhất
    const forkCount = {};
    forklifts.forEach(f => {
        const code = (f.code || '').trim().toUpperCase();
        if (code) forkCount[code] = (forkCount[code] || 0) + 1;
    });
    const worstFork = Object.entries(forkCount).sort((a, b) => b[1] - a[1])[0];

    // Loại lỗi phổ biến nhất
    const issueCount = {};
    forklifts.forEach(f => {
        const type = (f.issueType || '').trim();
        if (type) issueCount[type] = (issueCount[type] || 0) + 1;
    });
    const topIssue = Object.entries(issueCount).sort((a, b) => b[1] - a[1])[0];

    // Sự cố theo nhà cung cấp
    const supplierCount = {};
    forklifts.forEach(f => {
        const s = (f.supplier || 'Khác').trim();
        supplierCount[s] = (supplierCount[s] || 0) + 1;
    });

    // Tỷ lệ chưa sửa
    const pendingForks = forklifts.filter(f => !f.fixTime || f.fixTime === '' || f.fixTime === '-').length;

    // === PHÂN TÍCH VẬT TƯ ===
    // Vật tư cấp nhiều nhất (theo số lượt)
    const matCount = {};
    allocations.forEach(a => {
        const item = (a.item || '').trim();
        if (item) matCount[item] = (matCount[item] || 0) + 1;
    });
    const topMatItem = Object.entries(matCount).sort((a, b) => b[1] - a[1])[0];

    // Top 6 vật tư
    const topMats = Object.entries(matCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Bưu cục nhận nhiều nhất
    const poCount = {};
    allocations.forEach(a => {
        const po = (a.postOffice || '').split('-')[0].trim();
        if (po) poCount[po] = (poCount[po] || 0) + 1;
    });
    const topPo = Object.entries(poCount).sort((a, b) => b[1] - a[1])[0];

    // === CẬP NHẬT CARDS ===
    if (worstFork) {
        const el = document.getElementById('insight-fork-worst');
        const cnt = document.getElementById('insight-fork-worst-count');
        if (el) el.textContent = worstFork[0];
        if (cnt) cnt.textContent = `Ghi nhận ${worstFork[1]} lần sự cố trong kỳ báo cáo`;
    }
    if (topIssue) {
        const el = document.getElementById('insight-fork-top-issue');
        const cnt = document.getElementById('insight-fork-top-count');
        if (el) el.textContent = topIssue[0];
        if (cnt) cnt.textContent = `Xảy ra ${topIssue[1]} lần — chiếm ${Math.round(topIssue[1]/forklifts.length*100)}% tổng sự cố`;
    }
    if (topMatItem) {
        const el = document.getElementById('insight-mat-top-item');
        const cnt = document.getElementById('insight-mat-top-count');
        if (el) el.textContent = topMatItem[0];
        if (cnt) cnt.textContent = `Cấp phát ${topMatItem[1]} lần — ${Math.round(topMatItem[1]/allocations.length*100)}% tổng lượt`;
    }

    // === VẼ BIỂU ĐỒ XE NÂNG THEO NHÀ CUNG CẤP ===
    const forkCtx = document.getElementById('forkSupplierChart');
    if (forkCtx && Object.keys(supplierCount).length > 0) {
        if (charts['forkSupplierChart']) charts['forkSupplierChart'].destroy();
        const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981'];
        charts['forkSupplierChart'] = new Chart(forkCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(supplierCount),
                datasets: [{
                    label: 'Số lần sự cố',
                    data: Object.values(supplierCount),
                    backgroundColor: Object.keys(supplierCount).map((_, i) => colors[i % colors.length] + 'CC'),
                    borderColor: Object.keys(supplierCount).map((_, i) => colors[i % colors.length]),
                    borderWidth: 2,
                    borderRadius: 8,
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.raw} sự cố` } }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ba1b0' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ba1b0', stepSize: 1 }, beginAtZero: true }
                }
            }
        });
    }

    // === VẼ BIỂU ĐỒ TOP VẬT TƯ ===
    const matCtx = document.getElementById('matItemChart');
    if (matCtx && topMats.length > 0) {
        if (charts['matItemChart']) charts['matItemChart'].destroy();
        charts['matItemChart'] = new Chart(matCtx, {
            type: 'bar',
            data: {
                labels: topMats.map(([name]) => name.length > 18 ? name.slice(0, 18) + '…' : name),
                datasets: [{
                    label: 'Số lượt cấp',
                    data: topMats.map(([, cnt]) => cnt),
                    backgroundColor: 'rgba(16,185,129,0.7)',
                    borderColor: '#10b981',
                    borderWidth: 2,
                    borderRadius: 8,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => topMats[items[0].dataIndex][0],
                            label: ctx => ` ${ctx.raw} lượt cấp phát`
                        }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ba1b0', stepSize: 1 }, beginAtZero: true },
                    y: { grid: { display: false }, ticks: { color: '#9ba1b0', font: { size: 11 } } }
                }
            }
        });
    }

    // === ĐÁNH GIÁ & KHUYẾN NGHỊ ===
    const insightsEl = document.getElementById('analysis-insights');
    if (!insightsEl) return;

    const pendingRate = forklifts.length > 0 ? Math.round(pendingForks / forklifts.length * 100) : 0;
    const bcRate = allocations.length > 0 ? Math.round(allocations.filter(a => a.location && a.location.toLowerCase() === 'bc').length / allocations.length * 100) : 0;

    const insights = [
        {
            icon: 'truck',
            color: pendingForks > 0 ? '#ef4444' : '#10b981',
            bg: pendingForks > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
            border: pendingForks > 0 ? '#ef4444' : '#10b981',
            label: 'Xe Nâng Chờ Sửa',
            value: `${pendingForks} xe`,
            desc: pendingForks > 0
                ? `⚠️ Hiện có ${pendingForks} xe chưa được xử lý sự cố (${pendingRate}% tổng fleet). Cần liên hệ nhà cung cấp ưu tiên xử lý.`
                : '✅ Tất cả sự cố đã được xử lý trong kỳ báo cáo.'
        },
        {
            icon: 'repeat',
            color: worstFork && worstFork[1] >= 3 ? '#f59e0b' : '#10b981',
            bg: worstFork && worstFork[1] >= 3 ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
            border: worstFork && worstFork[1] >= 3 ? '#f59e0b' : '#10b981',
            label: 'Xe Sự Cố Tái Diễn',
            value: worstFork ? `${worstFork[0]}` : 'Không có',
            desc: worstFork && worstFork[1] >= 3
                ? `🔁 Xe ${worstFork[0]} xảy ra sự cố ${worstFork[1]} lần — có dấu hiệu hư hỏng tái diễn. Nên xem xét bảo dưỡng tổng thể hoặc đổi xe.`
                : `✅ Không có xe nào xảy ra sự cố tái diễn nhiều lần đáng lo ngại.`
        },
        {
            icon: 'package-check',
            color: '#3b82f6',
            bg: 'rgba(59,130,246,0.08)',
            border: '#3b82f6',
            label: 'Tỷ Lệ Cấp Về Bưu Cục',
            value: `${bcRate}%`,
            desc: bcRate >= 50
                ? `📦 ${bcRate}% vật tư được chuyển thẳng về bưu cục — cho thấy nhu cầu trang thiết bị tại điểm giao nhận đang cao.`
                : `📦 ${bcRate}% vật tư cấp về bưu cục, phần lớn còn lại phục vụ nội bộ kho. Phân bổ hợp lý.`
        },
        {
            icon: 'bar-chart-2',
            color: '#8b5cf6',
            bg: 'rgba(139,92,246,0.08)',
            border: '#8b5cf6',
            label: 'Bưu Cục Nhận Nhiều Nhất',
            value: topPo ? topPo[0] : '--',
            desc: topPo
                ? `📍 Bưu cục ${topPo[0]} nhận vật tư ${topPo[1]} lần trong kỳ — nhiều nhất hệ thống. Có thể đang trong giai đoạn mở rộng hoặc thiếu hụt trang thiết bị.`
                : 'Chưa đủ dữ liệu để phân tích.'
        }
    ];

    insightsEl.innerHTML = insights.map(ins => `
        <div style="background: ${ins.bg}; border: 1px solid ${ins.border}33; border-left: 3px solid ${ins.border}; border-radius: 12px; padding: 16px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <div style="width: 34px; height: 34px; background: ${ins.border}22; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i data-lucide="${ins.icon}" style="width: 18px; height: 18px; color: ${ins.color};"></i>
                </div>
                <div>
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${ins.label}</div>
                    <div style="font-size: 18px; font-weight: 800; color: ${ins.color}; line-height: 1.2;">${ins.value}</div>
                </div>
            </div>
            <p style="margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.6;">${ins.desc}</p>
        </div>
    `).join('');

    lucide.createIcons();
}

// --- SA BÀN KHO 2D LOGIC ---
function renderLayoutMap() {
    const container = document.getElementById('warehouse-layout-container');
    if (!container) return;

    let html = '<div class="layout-grid">';
    
    // Render Zones
    html += '<div class="layout-zone zone-inbound">INBOUND (15 Cửa)</div>';
    html += '<div class="layout-zone zone-sorting">SORTING (Chuyền phân loại)</div>';
    html += '<div class="layout-zone zone-outbound">OUTBOUND (30 Cửa)</div>';

    // Render 45 Dock Levelers
    // Inbound: 15 docks
    for(let i = 0; i < 15; i++) {
        let top = 30 + (i * 24);
        let statusClass = '';
        let tooltip = `<h4>Cửa Nhập (Inbound) #${i+1}</h4><p>Trạng thái: Hoạt động tốt</p>`;
        
        // Giả lập lỗi ở vài cửa
        if(i === 3 || i === 12) {
            statusClass = 'error';
            tooltip = `<h4>Cửa Nhập (Inbound) #${i+1}</h4><p style="color:var(--ghn-red)">Lỗi: Bơm thuỷ lực hỏng</p>`;
        }
        if(i === 7) {
            statusClass = 'maintenance';
            tooltip = `<h4>Cửa Nhập (Inbound) #${i+1}</h4><p>Đang bảo trì định kỳ</p>`;
        }
        
        html += `<div class="infra-node ${statusClass}" style="top: ${top}px; left: 8px;">
                    <div class="node-tooltip">${tooltip}</div>
                 </div>`;
    }

    // Outbound: 30 docks
    for(let i = 0; i < 30; i++) {
        let top = 30 + (i * 12);
        let statusClass = '';
        let tooltip = `<h4>Cửa Xuất (Outbound) #${i+1}</h4><p>Trạng thái: Hoạt động tốt</p>`;
        
        if(i === 8 || i === 22) {
            statusClass = 'error';
            tooltip = `<h4>Cửa Xuất (Outbound) #${i+1}</h4><p style="color:var(--ghn-red)">Lỗi: Kẹt hành trình cửa cuốn</p>`;
        }
        
        html += `<div class="infra-node ${statusClass}" style="top: ${top}px; left: 768px;">
                    <div class="node-tooltip">${tooltip}</div>
                 </div>`;
    }

    // Render Trạm biến áp & Bể nước
    html += `<div class="infra-node transformer" style="top: 360px; left: 360px;">
                <div class="node-tooltip"><h4>Trạm Biến Áp (2000kVA)</h4><p>Công suất hiện tại: 65%</p><p>Trạng thái: Ổn định</p></div>
             </div>`;
             
    html += `<div class="infra-node water-tank" style="top: 360px; left: 420px;">
                <div class="node-tooltip"><h4>Bể Ngầm PCCC</h4><p>Dung tích: 500m3</p><p>Trạng thái: Auto (Chờ)</p></div>
             </div>`;

    html += '</div>';
    container.innerHTML = html;
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

// =============================================
// STATE BỘ LỌC CHUNG (dùng cho cả filter bảng lẫn xuất báo cáo)
// =============================================
let reportFilter = { mode: 'all', week: null, month: null };

// Parse ngày từ dd/MM/yyyy hoặc yyyy-MM-dd
function parseDate(str) {
    if (!str || str === '-') return null;
    const s = str.trim();
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m1) return new Date(+m1[3], +m1[2]-1, +m1[1]);
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return new Date(+m2[1], +m2[2]-1, +m2[3]);
    return null;
}

function getWeekRange(date) {
    const d = new Date(date);
    const diff = (d.getDay() === 0) ? -6 : 1 - d.getDay();
    const mon  = new Date(d); mon.setDate(d.getDate() + diff);
    const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
    mon.setHours(0,0,0,0); sun.setHours(23,59,59,999);
    return { start: mon, end: sun };
}

function getMonthRange(y, m) {
    return { start: new Date(y, m, 1, 0,0,0), end: new Date(y, m+1, 0, 23,59,59,999) };
}

function filterByDate(arr, field) {
    if (reportFilter.mode === 'all') return arr;
    let range;
    const now = new Date();
    if (reportFilter.mode === 'week') {
        const wv = reportFilter.week;
        if (wv) { const [y,w] = wv.split('-W'); const d = new Date(+y, 0, 1+(+w-1)*7); range = getWeekRange(d); }
        else range = getWeekRange(now);
    } else {
        const mv = reportFilter.month;
        if (mv) { const [y,m] = mv.split('-'); range = getMonthRange(+y, +m-1); }
        else range = getMonthRange(now.getFullYear(), now.getMonth());
    }
    if (!range) return arr;
    return arr.filter(item => { const d = parseDate(item[field]); return d && d >= range.start && d <= range.end; });
}

// =============================================
// TOOLBAR TỔNG QUAN — điều khiển filter chung
// =============================================
function setReportFilter(mode, btn) {
    document.querySelectorAll('#rpt-btn-all, #rpt-btn-week, #rpt-btn-month').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    reportFilter.mode = mode;

    const wp = document.getElementById('rpt-week-picker');
    const mp = document.getElementById('rpt-month-picker');
    if (wp) wp.style.display = (mode === 'week')  ? 'flex' : 'none';
    if (mp) mp.style.display = (mode === 'month') ? 'flex' : 'none';

    const now = new Date();
    if (mode === 'week') {
        const yr = now.getFullYear();
        const wk = Math.ceil(((now - new Date(yr,0,1)) / 86400000 + new Date(yr,0,1).getDay() + 1) / 7);
        const wkStr = `${yr}-W${String(wk).padStart(2,'0')}`;
        const inp = document.getElementById('rpt-filter-week');
        if (inp) { inp.value = wkStr; reportFilter.week = wkStr; }
    } else if (mode === 'month') {
        const mStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        const inp = document.getElementById('rpt-filter-month');
        if (inp) { inp.value = mStr; reportFilter.month = mStr; }
    }
    updateReportPeriodLabel();
    // Cập nhật lại 2 bảng theo filter mới
    renderMaterialsTable(document.getElementById('searchMaterials')?.value || '');
    renderForkliftsTable(document.getElementById('searchForklifts')?.value || '');
}

function updateReportPeriodLabel() {
    reportFilter.week  = document.getElementById('rpt-filter-week')?.value  || null;
    reportFilter.month = document.getElementById('rpt-filter-month')?.value || null;
    const lbl = document.getElementById('rpt-period-label');
    if (!lbl) return;
    if (reportFilter.mode === 'all')   { lbl.textContent = 'Toàn bộ dữ liệu'; }
    else if (reportFilter.mode === 'week') {
        const wv = reportFilter.week;
        lbl.textContent = wv ? `Tuần ${wv.replace('-W','/')}` : 'Tuần này';
    } else {
        const mv = reportFilter.month;
        if (mv) { const [y,m] = mv.split('-'); lbl.textContent = `Tháng ${+m}/${y}`; }
        else lbl.textContent = 'Tháng này';
    }
    // Cập nhật bảng theo kỳ mới
    renderMaterialsTable(document.getElementById('searchMaterials')?.value || '');
    renderForkliftsTable(document.getElementById('searchForklifts')?.value || '');
}

// =============================================
// RENDER VẬT TƯ (dùng reportFilter chung)
// =============================================
function renderMaterialsTable(searchTerm = '') {
    const tbody = document.querySelector('#materialsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let allocations = filterByDate([...(ghnMaterialsData?.allocations || [])].reverse(), 'date');
    allocations.forEach(item => {
        const txt = `${item.date} ${item.postOffice} ${item.item} ${item.location} ${item.issuer}`.toLowerCase();
        if (searchTerm && !txt.includes(searchTerm.toLowerCase())) return;
        let sc = 'neutral';
        if ((item.location||'').toLowerCase() === 'bc')  sc = 'safe';
        if ((item.location||'').toLowerCase() === 'kho') sc = 'warning';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="white-space:nowrap;">${escapeHtml(item.date)}</td>
            <td><strong>${escapeHtml(item.postOffice)}</strong></td>
            <td>${escapeHtml(item.item)}</td>
            <td class="text-right" style="font-weight:600;">${escapeHtml(item.quantity)}</td>
            <td class="text-center">${escapeHtml(item.unit)}</td>
            <td class="text-center"><span class="status-badge ${sc}">${escapeHtml(item.location||'N/A')}</span></td>
            <td class="text-center" style="color:var(--accent-primary);">${escapeHtml(item.issuer||'N/A')}</td>`;
        tbody.appendChild(tr);
    });
}

function initMaterialsSearch() {
    document.getElementById('searchMaterials')?.addEventListener('input', e => renderMaterialsTable(e.target.value));
}

// =============================================
// RENDER XE NÂNG (dùng reportFilter chung)
// =============================================
// Xe nâng
function renderForkliftsTable(searchTerm = '') {
    const tbody = document.querySelector('#forkliftsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let forklifts = filterByDate([...(ghnMaterialsData?.forklifts || [])].reverse(), 'issueTime');
    forklifts.forEach(item => {
        const txt = `${item.code} ${item.supplier} ${item.issueType} ${item.note}`.toLowerCase();
        if (searchTerm && !txt.includes(searchTerm.toLowerCase())) return;
        const fixed = item.fixTime && item.fixTime !== '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(item.code)}</strong></td>
            <td>${escapeHtml(item.supplier)}</td>
            <td>${escapeHtml(item.issueType)}</td>
            <td class="text-center">${escapeHtml(item.issueTime)}</td>
            <td class="text-center">${escapeHtml(item.fixTime||'-')}</td>
            <td class="text-center"><span class="status-badge ${fixed?'safe':'critical'}">${fixed?'Đã khắc phục':'Đang xử lý'}</span></td>`;
        tbody.appendChild(tr);
    });
}

function initForkliftsSearch() {
    document.getElementById('searchForklifts')?.addEventListener('input', e => renderForkliftsTable(e.target.value));
}

// =============================================
// XUẤT BÁO CÁO TỔNG HỢP — 1 FILE DUY NHẤT
// =============================================
function exportCombinedReport() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric'});
    const timeStr = now.toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
    const exportedAt = `${dateStr} ${timeStr}`;

    // Xác định nhãn kỳ
    const lbl = document.getElementById('rpt-period-label');
    const periodLabel = lbl ? lbl.textContent : 'Toàn bộ dữ liệu';

    // Dữ liệu đã lọc
    const allocations = filterByDate([...(ghnMaterialsData?.allocations||[])].reverse(), 'date');
    const forklifts   = filterByDate([...(ghnMaterialsData?.forklifts||[])].reverse(), 'issueTime');

    // === THỐNG KÊ VẬT TƯ ===
    const matTotal   = allocations.length;
    const matBc      = allocations.filter(a=>(a.location||'').toLowerCase()==='bc').length;
    const matKho     = allocations.filter(a=>(a.location||'').toLowerCase()==='kho').length;
    const matUniqueItems = [...new Set(allocations.map(a=>a.item))].length;
    const matUniquePo    = [...new Set(allocations.map(a=>a.postOffice))].length;

    const itemCount = {};
    allocations.forEach(a=>{ const k=a.item||'N/A'; itemCount[k]=(itemCount[k]||0)+1; });
    const top5Mat = Object.entries(itemCount).sort((x,y)=>y[1]-x[1]).slice(0,5);

    // === THỐNG KÊ XE NÂNG ===
    const fkTotal   = forklifts.length;
    const fkFixed   = forklifts.filter(f=>f.fixTime&&f.fixTime!=='-').length;
    const fkPending = fkTotal - fkFixed;
    const fkCodes   = [...new Set(forklifts.map(f=>f.code))].length;
    const supMap = {}; forklifts.forEach(f=>{ const s=f.supplier||'Khác'; supMap[s]=(supMap[s]||0)+1; });
    const issMap = {}; forklifts.forEach(f=>{ const i=f.issueType||'N/A'; issMap[i]=(issMap[i]||0)+1; });
    const topIssue = Object.entries(issMap).sort((a,b)=>b[1]-a[1])[0];

    // === CSS CHUNG ===
    const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Inter',sans-serif;background:#0f1923;color:#e0e6ed;min-height:100vh;}
  .topbar{background:linear-gradient(135deg,#f26522 0%,#e55a1c 100%);padding:20px 30px;display:flex;align-items:center;gap:15px;}
  .topbar-logo{font-size:32px;} .topbar-title{font-size:20px;font-weight:700;color:#fff;}
  .topbar-sub{font-size:13px;color:rgba(255,255,255,0.85);margin-top:3px;}
  .container{max-width:1400px;margin:0 auto;padding:25px 20px;}
  .period-tag{display:inline-flex;align-items:center;gap:8px;background:rgba(242,101,34,0.12);border:1px solid rgba(242,101,34,0.35);color:#f26522;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:24px;}
  .chapter{margin-bottom:36px;}
  .chapter-title{font-size:18px;font-weight:700;color:#fff;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid rgba(242,101,34,0.35);display:flex;align-items:center;gap:10px;}
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:20px;}
  .stat-card{background:#1a2634;border-radius:12px;padding:16px 18px;border:1px solid #263040;position:relative;overflow:hidden;}
  .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--a,#f26522);}
  .stat-card.g{--a:#27ae60;} .stat-card.y{--a:#f39c12;} .stat-card.r{--a:#e74c3c;} .stat-card.b{--a:#2980b9;}
  .stat-label{font-size:11px;color:#7f8c9a;text-transform:uppercase;letter-spacing:.5px;font-weight:600;}
  .stat-value{font-size:28px;font-weight:700;margin-top:5px;color:#ecf0f1;} .stat-desc{font-size:12px;color:#95a5a6;margin-top:3px;}
  .section{background:#1a2634;border-radius:12px;padding:18px;margin-bottom:16px;border:1px solid #263040;}
  .section-title{font-size:14px;font-weight:600;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #263040;}
  .alert{border-radius:8px;padding:12px 16px;margin-bottom:14px;border-left:4px solid;}
  .alert.d{background:rgba(231,76,60,.1);border-color:#e74c3c;color:#e74c3c;}
  .alert.ok{background:rgba(39,174,96,.1);border-color:#27ae60;color:#27ae60;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th{background:#0f1923;color:#7f8c9a;text-transform:uppercase;font-size:11px;letter-spacing:.5px;padding:9px 12px;text-align:left;border-bottom:2px solid #263040;font-weight:600;}
  td{padding:9px 12px;border-bottom:1px solid #1e2d3d;vertical-align:middle;}
  tr:hover td{background:rgba(242,101,34,.05);}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
  .badge.g{background:rgba(39,174,96,.15);color:#27ae60;border:1px solid rgba(39,174,96,.3);}
  .badge.r{background:rgba(231,76,60,.15);color:#e74c3c;border:1px solid rgba(231,76,60,.3);}
  .badge.y{background:rgba(243,156,18,.15);color:#f39c12;border:1px solid rgba(243,156,18,.3);}
  .badge.gr{background:rgba(127,140,153,.15);color:#7f8c9a;}
  .c{text-align:center;} .r2{text-align:right;} .bold{font-weight:600;} .tw{overflow-x:auto;}
  .divider{border:none;border-top:1px solid #263040;margin:30px 0;}
  .footer{text-align:center;color:#4a5568;font-size:12px;padding:28px 20px;border-top:1px solid #1e2d3d;margin-top:10px;}`;

    // === ROWS VẬT TƯ ===
    const matRows = allocations.map(a => {
        const lc = (a.location||'').toLowerCase();
        const bc = lc==='bc'?'g': lc==='kho'?'y':'gr';
        return `<tr><td style="white-space:nowrap;">${a.date||'-'}</td><td class="bold">${a.postOffice||'-'}</td><td>${a.item||'-'}</td><td class="r2 bold">${a.quantity||'-'}</td><td class="c">${a.unit||'-'}</td><td class="c"><span class="badge ${bc}">${a.location||'N/A'}</span></td><td class="c">${a.issuer||'-'}</td></tr>`;
    }).join('') || `<tr><td colspan="7" style="text-align:center;color:#4a5568;padding:20px;">Không có dữ liệu trong kỳ này</td></tr>`;

    const top5Rows = top5Mat.map(([n,c])=>`<tr><td>${n}</td><td class="c bold">${c} lượt</td></tr>`).join('');

    // === ROWS XE NÂNG ===
    const fkRows = forklifts.map(f => {
        const ok = f.fixTime && f.fixTime!=='-';
        return `<tr ${!ok?'style="background:rgba(231,76,60,.04)"':''}><td class="bold">${f.code||'-'}</td><td>${f.supplier||'-'}</td><td>${f.issueType||'-'}</td><td class="c">${f.issueTime||'-'}</td><td class="c">${f.fixTime||'-'}</td><td class="c"><span class="badge ${ok?'g':'r'}">${ok?'✅ Đã xử lý':'⚠️ Đang xử lý'}</span></td></tr>`;
    }).join('') || `<tr><td colspan="6" style="text-align:center;color:#4a5568;padding:20px;">Không có dữ liệu trong kỳ này</td></tr>`;

    const supRows = Object.entries(supMap).sort((a,b)=>b[1]-a[1])
        .map(([s,c])=>`<tr><td>${s}</td><td class="c bold">${c} sự cố</td></tr>`).join('');

    const fkAlert = fkPending > 0
        ? `<div class="alert d">🚨 <strong>Cảnh báo:</strong> Có <strong>${fkPending} xe nâng</strong> chưa khắc phục sự cố. Liên hệ nhà cung cấp xử lý trong 48h!</div>`
        : `<div class="alert ok">✅ Tất cả sự cố trong kỳ đã được khắc phục.</div>`;

    // === BUILD HTML ===
    const html = `<!DOCTYPE html><html lang="vi"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Báo Cáo Vận Hành — KTC Hưng Yên — ${periodLabel}</title>
<style>${css}</style></head><body>

<div class="topbar">
  <div class="topbar-logo">📊</div>
  <div>
    <div class="topbar-title">BÁO CÁO TỔNG HỢP VẬN HÀNH — KTC HƯNG YÊN</div>
    <div class="topbar-sub">Kỳ báo cáo: ${periodLabel} &nbsp;|&nbsp; Xuất ngày: ${exportedAt} &nbsp;|&nbsp; GHN Command Center &nbsp;|&nbsp; Phó phòng: Nguyễn Văn Bảo</div>
  </div>
</div>

<div class="container">
  <div class="period-tag">📅 ${periodLabel}</div>

  <!-- ===== CHƯƠNG 1: CẤP PHÁT VẬT TƯ ===== -->
  <div class="chapter">
    <div class="chapter-title">📦 PHẦN 1 — CẤP PHÁT VẬT TƯ & CCDC</div>

    <div class="stats-grid">
      <div class="stat-card g"><div class="stat-label">Tổng lượt cấp</div><div class="stat-value">${matTotal}</div><div class="stat-desc">bản ghi trong kỳ</div></div>
      <div class="stat-card b"><div class="stat-label">Cấp về Bưu Cục</div><div class="stat-value">${matBc}</div><div class="stat-desc">lượt BC nhận hàng</div></div>
      <div class="stat-card y"><div class="stat-label">Cấp về Kho</div><div class="stat-value">${matKho}</div><div class="stat-desc">lượt nội bộ kho</div></div>
      <div class="stat-card"><div class="stat-label">Loại vật tư</div><div class="stat-value">${matUniqueItems}</div><div class="stat-desc">mặt hàng khác nhau</div></div>
      <div class="stat-card"><div class="stat-label">Đơn vị nhận</div><div class="stat-value">${matUniquePo}</div><div class="stat-desc">bưu cục nhận hàng</div></div>
    </div>

    <div class="section">
      <div class="section-title">🏆 Top 5 Vật Tư Cấp Nhiều Nhất</div>
      <table><thead><tr><th>Tên Vật Tư / CCDC</th><th class="c">Số Lượt Cấp</th></tr></thead>
      <tbody>${top5Rows||'<tr><td colspan="2" style="text-align:center;color:#4a5568;">Không có dữ liệu</td></tr>'}</tbody></table>
    </div>

    <div class="section">
      <div class="section-title">📋 Chi Tiết Lịch Sử Cấp Phát</div>
      <div class="tw"><table>
        <thead><tr><th>Ngày Cấp</th><th>Bưu Cục</th><th>Hàng Hóa / CCDC</th><th class="r2">Số Lượng</th><th class="c">ĐVT</th><th class="c">Địa Điểm</th><th class="c">Người Cấp</th></tr></thead>
        <tbody>${matRows}</tbody>
      </table></div>
    </div>
  </div>

  <hr class="divider">

  <!-- ===== CHƯƠNG 2: XE NÂNG ĐIỆN ===== -->
  <div class="chapter">
    <div class="chapter-title">🔧 PHẦN 2 — SỰ CỐ XE NÂNG ĐIỆN</div>
    ${fkAlert}

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Tổng sự cố</div><div class="stat-value">${fkTotal}</div><div class="stat-desc">lần ghi nhận</div></div>
      <div class="stat-card g"><div class="stat-label">Đã khắc phục</div><div class="stat-value">${fkFixed}</div><div class="stat-desc">sự cố hoàn thành</div></div>
      <div class="stat-card r"><div class="stat-label">Đang xử lý</div><div class="stat-value">${fkPending}</div><div class="stat-desc">chưa khắc phục</div></div>
      <div class="stat-card b"><div class="stat-label">Số xe sự cố</div><div class="stat-value">${fkCodes}</div><div class="stat-desc">xe nâng gặp vấn đề</div></div>
      <div class="stat-card y"><div class="stat-label">Lỗi phổ biến nhất</div><div class="stat-value" style="font-size:15px;margin-top:8px;">${topIssue?topIssue[0]:'N/A'}</div><div class="stat-desc">${topIssue?topIssue[1]+' lần':''}</div></div>
    </div>

    <div class="section">
      <div class="section-title">🏭 Sự Cố Phân Theo Nhà Cung Cấp</div>
      <table><thead><tr><th>Nhà Cung Cấp</th><th class="c">Số Sự Cố</th></tr></thead>
      <tbody>${supRows||'<tr><td colspan="2" style="text-align:center;color:#4a5568;">Không có dữ liệu</td></tr>'}</tbody></table>
    </div>

    <div class="section">
      <div class="section-title">📋 Chi Tiết Nhật Ký Sự Cố Xe Nâng</div>
      <div class="tw"><table>
        <thead><tr><th>Mã Xe</th><th>Nhà Cung Cấp</th><th>Loại Sự Cố</th><th class="c">Thời Gian Sự Cố</th><th class="c">Thời Gian Xử Lý</th><th class="c">Trạng Thái</th></tr></thead>
        <tbody>${fkRows}</tbody>
      </table></div>
    </div>
  </div>

  <div class="footer">
    📌 NỘI BỘ — KTC HƯNG YÊN &nbsp;|&nbsp; Phó phòng: <strong>Nguyễn Văn Bảo</strong> (3006216) &nbsp;|&nbsp;
    Tạo tự động bởi GHN Command Center &nbsp;|&nbsp; ${exportedAt}
  </div>
</div>
</body></html>`;

    // Tải xuống
    const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const fname = `BaoCao_VanHanh_KTC_HungYen_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.html`;
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
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
        const safeLink = (item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))) ? item.link : '';
        tr.innerHTML = `
            <td><strong>${escapeHtml(item.itemName)}</strong></td>
            <td>${escapeHtml(item.itemCode)}</td>
            <td class="text-right" style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item.quantity)}</td>
            <td class="text-center">${escapeHtml(item.orderDate || '-')}</td>
            <td class="text-center">${escapeHtml(item.receiveDate || '-')}</td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">
                    ${escapeHtml(statusText)}
                </span>
            </td>
            <td class="text-center">
                ${safeLink ? `<a href="${escapeHtml(safeLink)}" target="_blank" style="color: var(--ghn-orange); text-decoration: none;"><i data-lucide="external-link" style="width: 16px; height: 16px;"></i></a>` : '-'}
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

// --- AUTHENTICATION LOGIC ---
let tempMsnv = ''; // Lưu tạm MSNV để dùng ở bước OTP

// Callback cho Google Sign-In
function handleCredentialResponse(response) {
    const responsePayload = decodeJwtResponse(response.credential);
    const email = responsePayload.email;
    
    // Yêu cầu xác thực email qua Apps Script
    fetch(`${APPS_SCRIPT_URL}?action=google_login&email=${encodeURIComponent(email)}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                tempMsnv = data.msnv;
                requestOTP(tempMsnv);
            } else {
                showAuthMessage(data.message || 'Lỗi xác thực Google.', 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showAuthMessage('Lỗi kết nối máy chủ.', 'error');
        });
}

// Giải mã JWT để lấy email
function decodeJwtResponse(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

function requestOTP(msnv) {
    showAuthMessage('Đang tạo mã OTP...', 'info');
    fetch(`${APPS_SCRIPT_URL}?action=request_otp&msnv=${encodeURIComponent(msnv)}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                document.getElementById('login-form').classList.remove('active');
                setTimeout(() => document.getElementById('login-form').classList.add('hidden'), 50);
                document.getElementById('otp-form').classList.remove('hidden');
                setTimeout(() => document.getElementById('otp-form').classList.add('active'), 50);
                hideAuthMessage();
            } else if (data.status === 'missing_chatid') {
                document.getElementById('login-form').classList.remove('active');
                setTimeout(() => document.getElementById('login-form').classList.add('hidden'), 50);
                document.getElementById('chatid-form').classList.remove('hidden');
                setTimeout(() => document.getElementById('chatid-form').classList.add('active'), 50);
                hideAuthMessage();
            } else {
                showAuthMessage(data.message || 'Lỗi khi yêu cầu OTP.', 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showAuthMessage('Lỗi kết nối máy chủ khi gửi OTP.', 'error');
        });
}

function initAuth() {
    const authOverlay = document.getElementById('auth-overlay');
    const mainApp = document.getElementById('main-app');
    
    // Handle Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if(confirm('Bạn có chắc chắn muốn đăng xuất không?')) {
                localStorage.removeItem('ghn_auth_token');
                localStorage.removeItem('ghn_user_role');
                window.location.reload();
            }
        });
    }

    // Check if already logged in
    if (localStorage.getItem('ghn_auth_token') === 'verified') {
        const localMsnv = localStorage.getItem('ghn_user_msnv') || '';
        const localRole = localStorage.getItem('ghn_user_role') || '';
        
        // Xác thực phiên đăng nhập thực tế từ server để chống giả mạo localStorage
        fetch(`${APPS_SCRIPT_URL}?action=verify_session&msnv=${encodeURIComponent(localMsnv)}&role=${encodeURIComponent(localRole)}`)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    // Cập nhật lại role và permissions chuẩn từ Sheets
                    localStorage.setItem('ghn_user_role', data.role);
                    localStorage.setItem('ghn_user_perms', data.permissions);
                    authOverlay.style.display = 'none';
                    mainApp.style.display = 'flex';
                    applyRoleRestrictions();
                    loadData();
                } else {
                    // Phiên giả mạo hoặc tài khoản đã bị khóa -> xóa cache và tải lại trang
                    localStorage.removeItem('ghn_auth_token');
                    localStorage.removeItem('ghn_user_role');
                    localStorage.removeItem('ghn_user_perms');
                    window.location.reload();
                }
            })
            .catch(err => {
                console.error('Lỗi kết nối xác thực phiên:', err);
                // Nếu lỗi mạng, tạm thời cho dùng dựa trên cache offline
                authOverlay.style.display = 'none';
                mainApp.style.display = 'flex';
                applyRoleRestrictions();
                loadData();
            });
        return;
    }
    
    document.getElementById('go-to-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('otp-form').classList.remove('active');
        setTimeout(() => document.getElementById('otp-form').classList.add('hidden'), 50);
        document.getElementById('login-form').classList.remove('hidden');
        setTimeout(() => document.getElementById('login-form').classList.add('active'), 50);
        hideAuthMessage();
    });
    
    // Telegram Guide Modal Logic
    const tgGuideModal = document.getElementById('telegram-guide-modal');
    const openTgGuideBtn = document.getElementById('open-telegram-guide');
    const closeTgGuideBtn = document.getElementById('close-telegram-guide');
    const understoodTgGuideBtn = document.getElementById('btn-understood-guide');

    if (openTgGuideBtn && tgGuideModal) {
        openTgGuideBtn.addEventListener('click', (e) => {
            e.preventDefault();
            tgGuideModal.style.display = 'flex';
            setTimeout(() => tgGuideModal.classList.remove('hidden'), 10);
        });
    }

    const openTgGuideBtn2 = document.getElementById('open-telegram-guide-2');
    if (openTgGuideBtn2 && tgGuideModal) {
        openTgGuideBtn2.addEventListener('click', (e) => {
            e.preventDefault();
            tgGuideModal.style.display = 'flex';
            setTimeout(() => tgGuideModal.classList.remove('hidden'), 10);
        });
    }

    const closeTgGuide = () => {
        if (!tgGuideModal) return;
        tgGuideModal.classList.add('hidden');
        setTimeout(() => tgGuideModal.style.display = 'none', 300);
    };

    if (closeTgGuideBtn) closeTgGuideBtn.addEventListener('click', closeTgGuide);
    if (understoodTgGuideBtn) understoodTgGuideBtn.addEventListener('click', closeTgGuide);
    if (tgGuideModal) {
        tgGuideModal.addEventListener('click', (e) => {
            if (e.target === tgGuideModal) closeTgGuide();
        });
    }
    
    // Handle Login Step 1 (MSNV + Password)
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msnv = document.getElementById('login-username').value;
        const pass = document.getElementById('login-password').value;
        const btn = document.getElementById('btn-login');
        
        btn.innerHTML = '<span>Đang kiểm tra...</span>';
        
        try {
            // BACKDOOR ĐÃ BỊ XÓA - YÊU CẦU DÙNG GOOGLE APPS SCRIPT
            const response = await fetch(`${APPS_SCRIPT_URL}?action=login&msnv=${encodeURIComponent(msnv)}&password=${encodeURIComponent(pass)}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                tempMsnv = data.msnv;
                requestOTP(tempMsnv);
            } else if (data.status === 'bypass_otp') {
                localStorage.setItem('ghn_auth_token', 'verified');
                localStorage.setItem('ghn_user_role', data.role);
                localStorage.setItem('ghn_user_msnv', data.msnv || '');
                localStorage.setItem('ghn_user_fullname', data.fullname || '');
                let permsArray = data.permissions || ['overview'];
                if (typeof permsArray === 'string') {
                    permsArray = permsArray.split(',').map(p => p.trim()).filter(p => p);
                }
                localStorage.setItem('ghn_user_perms', JSON.stringify(permsArray));
                authOverlay.style.display = 'none';
                mainApp.style.display = 'flex';
                applyRoleRestrictions();
                loadData();
            } else {
                showAuthMessage(data.message || 'Sai MSNV hoặc mật khẩu!', 'error');
            }
        } catch (error) {
            console.error(error);
            showAuthMessage('Lỗi mạng. Không thể kết nối với hệ thống.', 'error');
        } finally {
            btn.innerHTML = '<span>Đăng Nhập</span><i data-lucide="arrow-right"></i>';
            lucide.createIcons();
        }
    });

    // Handle OTP Step 2
    document.getElementById('otp-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const otp = document.getElementById('otp-input').value;
        const btn = document.getElementById('btn-verify-otp');
        
        btn.innerHTML = '<span>Đang xác nhận...</span>';
        
        try {
            const response = await fetch(`${APPS_SCRIPT_URL}?action=verify_otp&msnv=${encodeURIComponent(tempMsnv)}&otp=${encodeURIComponent(otp)}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                localStorage.setItem('ghn_auth_token', 'verified');
                localStorage.setItem('ghn_user_role', data.role);
                localStorage.setItem('ghn_user_msnv', tempMsnv || '');
                localStorage.setItem('ghn_user_fullname', data.fullname || '');
                // Permissions có thể là string hoặc array, chuẩn hóa về array
                let permsArray = data.permissions || ['overview'];
                if (typeof permsArray === 'string') {
                    permsArray = permsArray.split(',').map(p => p.trim()).filter(p => p);
                }
                localStorage.setItem('ghn_user_perms', JSON.stringify(permsArray));
                authOverlay.style.display = 'none';
                mainApp.style.display = 'flex';
                applyRoleRestrictions();
                loadData();
            } else {
                showAuthMessage(data.message || 'Mã OTP không chính xác!', 'error');
            }
        } catch (error) {
            console.error(error);
            showAuthMessage('Lỗi xác minh OTP.', 'error');
        } finally {
            btn.innerHTML = '<span>Xác Nhận & Truy Cập</span><i data-lucide="shield-check"></i>';
            lucide.createIcons();
        }
    });

    // Handle Chat ID Submit
    document.getElementById('chatid-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const chatid = document.getElementById('chatid-input').value.trim();
        const btn = document.getElementById('btn-submit-chatid');
        
        btn.innerHTML = '<span>Đang gửi yêu cầu...</span>';
        btn.disabled = true;
        
        try {
            const response = await fetch(`${APPS_SCRIPT_URL}?action=submit_chatid&msnv=${encodeURIComponent(tempMsnv)}&chatid=${encodeURIComponent(chatid)}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                showAuthMessage('Yêu cầu đã gửi! Vui lòng chờ Admin duyệt.', 'success');
                setTimeout(() => {
                    document.getElementById('chatid-form').classList.remove('active');
                    setTimeout(() => document.getElementById('chatid-form').classList.add('hidden'), 50);
                    document.getElementById('login-form').classList.remove('hidden');
                    setTimeout(() => document.getElementById('login-form').classList.add('active'), 50);
                }, 3000);
            } else {
                showAuthMessage(data.message || 'Lỗi gửi yêu cầu!', 'error');
            }
        } catch (error) {
            console.error(error);
            showAuthMessage('Lỗi mạng. Không thể gửi yêu cầu.', 'error');
        } finally {
            btn.innerHTML = '<span>Gửi Yêu Cầu Duyệt</span><i data-lucide="send"></i>';
            btn.disabled = false;
            lucide.createIcons();
        }
    });
    
    document.getElementById('go-to-login-from-chatid')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('chatid-form').classList.remove('active');
        setTimeout(() => document.getElementById('chatid-form').classList.add('hidden'), 50);
        document.getElementById('login-form').classList.remove('hidden');
        setTimeout(() => document.getElementById('login-form').classList.add('active'), 50);
        hideAuthMessage();
    });

    // ===== REGISTER FLOW =====
    // Mở form đăng ký
    document.getElementById('open-register')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthForm('login-form', 'register-form');
        hideAuthMessage();
    });

    // Quay lại đăng nhập từ register
    document.getElementById('go-to-login-from-reg')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthForm('register-form', 'login-form');
        hideAuthMessage();
    });

    // Mở Telegram Guide từ form đăng ký
    document.getElementById('open-tg-from-reg')?.addEventListener('click', (e) => {
        e.preventDefault();
        const modal = document.getElementById('telegram-guide-modal');
        if (modal) { modal.style.display = 'flex'; modal.classList.remove('hidden'); }
    });

    // Submit form đăng ký
    document.getElementById('register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-register');
        
        const fullname = document.getElementById('reg-fullname').value.trim();
        const msnv     = document.getElementById('reg-msnv').value.trim();
        const password = document.getElementById('reg-password').value;
        const password2= document.getElementById('reg-password2').value;
        const phone    = document.getElementById('reg-phone').value.trim();
        const chatid   = document.getElementById('reg-chatid').value.trim();

        // Validate phía client
        if (!validatePassword(password)) {
            showAuthMessage('Mật khẩu chưa đáp ứng đủ yêu cầu bảo mật!', 'error');
            return;
        }
        if (password !== password2) {
            showAuthMessage('Mật khẩu nhập lại không khớp!', 'error');
            return;
        }
        if (!/^0\d{9}$/.test(phone)) {
            showAuthMessage('Số điện thoại không hợp lệ (cần 10 chữ số, bắt đầu bằng 0)!', 'error');
            return;
        }

        btn.innerHTML = '<span>Đang gửi yêu cầu...</span>';
        btn.disabled = true;

        try {
            const params = new URLSearchParams({ action: 'register', fullname, msnv, password, phone, chatid });
            const response = await fetch(`${APPS_SCRIPT_URL}?${params}`);
            const data = await response.json();

            if (data.status === 'success') {
                showAuthMessage('✅ Đăng ký thành công! Admin sẽ duyệt tài khoản trong vòng 24h. Sau khi được duyệt, bạn sẽ nhận thông báo qua Telegram.', 'success');
                document.getElementById('register-form').reset();
                resetPwdRules();
                setTimeout(() => {
                    switchAuthForm('register-form', 'login-form');
                    hideAuthMessage();
                }, 5000);
            } else {
                showAuthMessage(data.message || 'Đăng ký thất bại. Vui lòng thử lại!', 'error');
            }
        } catch (err) {
            console.error(err);
            showAuthMessage('Lỗi kết nối máy chủ. Vui lòng thử lại!', 'error');
        } finally {
            btn.innerHTML = '<span>Gửi Yêu Cầu Đăng Ký</span><i data-lucide="send"></i>';
            btn.disabled = false;
            lucide.createIcons();
        }
    });
}

// Helper: switch giữa các form auth
function switchAuthForm(fromId, toId) {
    const from = document.getElementById(fromId);
    const to   = document.getElementById(toId);
    if (from) { from.classList.remove('active'); setTimeout(() => from.classList.add('hidden'), 50); }
    if (to)   { to.classList.remove('hidden'); setTimeout(() => to.classList.add('active'), 50); }
}

// Helper: toggle hiện/ẩn mật khẩu
function togglePassVis(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden
        ? '<i data-lucide="eye-off" style="width:16px;height:16px;"></i>'
        : '<i data-lucide="eye" style="width:16px;height:16px;"></i>';
    lucide.createIcons();
}

// Helper: kiểm tra từng rule của mật khẩu
function validatePassword(pwd) {
    return pwd.length >= 8
        && /[A-Z]/.test(pwd)
        && /[a-z]/.test(pwd)
        && /[0-9]/.test(pwd)
        && /[^A-Za-z0-9]/.test(pwd);
}

function resetPwdRules() {
    ['rule-len','rule-upper','rule-lower','rule-num','rule-special'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('pass');
    });
}

// Gọi khi người dùng gõ mật khẩu — cập nhật badge rules realtime
function checkRegPassword() {
    const pwd  = document.getElementById('reg-password')?.value || '';
    const pwd2 = document.getElementById('reg-password2')?.value || '';

    const rules = {
        'rule-len':     pwd.length >= 8,
        'rule-upper':   /[A-Z]/.test(pwd),
        'rule-lower':   /[a-z]/.test(pwd),
        'rule-num':     /[0-9]/.test(pwd),
        'rule-special': /[^A-Za-z0-9]/.test(pwd),
    };

    Object.entries(rules).forEach(([id, pass]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('pass', pass);
        const icon = el.querySelector('i, svg');
        if (icon) {
            // Update data-lucide attribute then re-render
            const newIcon = pass ? 'check-circle' : 'x-circle';
            el.innerHTML = `<i data-lucide="${newIcon}" style="width:13px;height:13px;"></i> ${el.textContent.trim()}`;
            lucide.createIcons({ nodes: [el] });
        }
    });

    // Match indicator
    const matchEl = document.getElementById('pwd-match-msg');
    if (matchEl) {
        if (!pwd2) { matchEl.textContent = ''; return; }
        if (pwd === pwd2) {
            matchEl.innerHTML = '<span style="color:#10b981;">✓ Mật khẩu khớp</span>';
        } else {
            matchEl.innerHTML = '<span style="color:#ef4444;">✗ Mật khẩu chưa khớp</span>';
        }
    }
}


function applyRoleRestrictions() {
    const role = localStorage.getItem('ghn_user_role');
    const uploadZone = document.getElementById('db-upload-zone');
    const aiWidget = document.getElementById('ai-chat-widget');
    
    // Ẩn tất cả menu trước
    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
        item.style.display = 'none';
    });
    
    if (role === 'user') {
        if (uploadZone) uploadZone.style.display = 'none';
        if (aiWidget) aiWidget.style.display = 'none';
        
        document.querySelectorAll('button').forEach(btn => {
            if(btn.textContent.toLowerCase().includes('tải') || btn.textContent.toLowerCase().includes('download')) {
                btn.style.display = 'none';
            }
        });
        
        const roleLabel = document.querySelector('.user-role');
        if(roleLabel) roleLabel.textContent = 'NHÂN VIÊN KHO';
        
        // Lấy quyền từ LocalStorage, đảm bảo là array
        let myPerms = [];
        try {
            const raw = localStorage.getItem('ghn_user_perms');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                myPerms = parsed;
            } else if (typeof parsed === 'string') {
                myPerms = parsed.split(',').map(p => p.trim()).filter(p => p);
            }
        } catch(e) {
            myPerms = ['overview'];
        }
        if (myPerms.length === 0) myPerms = ['overview'];
        
        // Hiển thị menu được cấp quyền
        myPerms.forEach(menuId => {
            const el = document.querySelector(`.nav-menu .nav-item[data-target="${menuId.trim()}"]`);
            if(el) el.style.display = 'flex';
        });
        
        // Tự động navigate sang tab đầu tiên được phép
        const firstPerm = myPerms[0];
        if (firstPerm) {
            setTimeout(() => {
                const firstNav = document.querySelector(`.nav-menu .nav-item[data-target="${firstPerm.trim()}"]`);
                if (firstNav) firstNav.click();
            }, 300);
        }
        
    } else {
        // Admin role: hiển thị tất cả
        if(aiWidget) aiWidget.style.display = 'flex';
        const roleLabel = document.querySelector('.user-role');
        if(roleLabel) roleLabel.textContent = 'QUẢN TRị VIÊN';
        
        document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
            item.style.display = 'flex';
        });
        
        setTimeout(initUserManagement, 100);
    }
}

function showAuthMessage(msg, type) {
    const el = document.getElementById('auth-message');
    if(!el) return;
    el.textContent = msg;
    el.className = `auth-message ${type}`;
    el.classList.remove('hidden');
}

function hideAuthMessage() {
    const el = document.getElementById('auth-message');
    if(!el) return;
    el.className = 'auth-message hidden';
}

// Start app via Auth Flow
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initChatbot();
    if (typeof ccdcUpdateVoiceUI === 'function') {
        ccdcUpdateVoiceUI();
    }
});

// --- AI CHATBOT LOGIC ---
function initChatbot() {
    const toggleBtn = document.getElementById('ai-chat-toggle');
    const panel = document.getElementById('ai-chat-panel');
    const closeBtn = document.getElementById('ai-chat-close');
    const sendBtn = document.getElementById('ai-chat-send');
    const inputField = document.getElementById('ai-chat-input');
    const history = document.getElementById('ai-chat-history');
    
    // Only show toggle if user is logged in
    if(localStorage.getItem('ghn_auth_token') === 'verified') {
        document.getElementById('ai-chat-widget').style.display = 'flex';
    }

    // Toggle panel
    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            inputField.focus();
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.add('hidden');
    });

    // Send Message
    const sendMessage = async () => {
        const text = inputField.value.trim();
        if (!text) return;

        // Add user message to UI
        appendMessage(text, 'user');
        inputField.value = '';
        inputField.disabled = true;
        sendBtn.disabled = true;

        // Add typing indicator
        const typingId = appendTypingIndicator();
        scrollToBottom();

        try {
            // Call Apps Script Backend
            const response = await fetch(`${REPORT_API_URL}?action=chat&message=${encodeURIComponent(text)}`);
            const data = await response.json();
            
            removeElement(typingId);
            
            if (data.status === 'success') {
                appendMessage(data.reply, 'bot');
            } else {
                appendMessage("Xin lỗi Sếp, hệ thống nơ-ron của tôi đang bị gián đoạn. Vui lòng kiểm tra lại cấu hình API.", 'bot');
            }
        } catch (error) {
            console.error(error);
            removeElement(typingId);
            appendMessage("Lỗi mạng! Không thể kết nối với hệ thống AI. Sếp hãy dán code vào Google Apps Script và Deploy lại nhé.", 'bot');
        } finally {
            inputField.disabled = false;
            sendBtn.disabled = false;
            inputField.focus();
            scrollToBottom();
        }
    };

    sendBtn.addEventListener('click', sendMessage);
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    function appendMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Tránh tấn công XSS bằng cách escape HTML trước khi format markdown
        let escapedText = escapeHtml(text);
        
        // Handle basic markdown bold (**text**) -> <strong>text</strong>
        let formattedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Handle newlines
        formattedText = formattedText.replace(/\n/g, '<br>');
        
        contentDiv.innerHTML = formattedText;
        
        msgDiv.appendChild(contentDiv);
        history.appendChild(msgDiv);
        scrollToBottom();
    }

    function appendTypingIndicator() {
        const id = 'typing-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message bot`;
        msgDiv.id = id;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        
        msgDiv.appendChild(contentDiv);
        history.appendChild(msgDiv);
        return id;
    }

    function removeElement(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        history.scrollTop = history.scrollHeight;
    }
}

// ==========================================
// EXCEL DRAG & DROP (ZERO-CODE DATABASE)
// ==========================================
const dbUploadZone = document.getElementById('db-upload-zone');
const excelInput = document.getElementById('excel-upload-input');

if (dbUploadZone && excelInput) {
    dbUploadZone.addEventListener('click', () => excelInput.click());
    
    dbUploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dbUploadZone.style.borderColor = 'var(--ghn-green)';
        dbUploadZone.style.background = 'rgba(16, 185, 129, 0.1)';
    });
    
    dbUploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dbUploadZone.style.borderColor = 'rgba(255,255,255,0.2)';
        dbUploadZone.style.background = 'transparent';
    });
    
    dbUploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dbUploadZone.style.borderColor = 'rgba(255,255,255,0.2)';
        dbUploadZone.style.background = 'transparent';
        if (e.dataTransfer.files.length) {
            handleExcelUpload(e.dataTransfer.files[0]);
        }
    });
    
    excelInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleExcelUpload(e.target.files[0]);
        }
    });
}

function handleExcelUpload(file) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        alert("Sếp vui lòng chọn file Excel (.xlsx, .xls)!");
        return;
    }
    
    // Đổi icon thành loading
    const icon = dbUploadZone.querySelector('i');
    const originalIcon = icon.getAttribute('data-lucide');
    icon.setAttribute('data-lucide', 'loader');
    lucide.createIcons();
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        try {
            const workbook = XLSX.read(data, {type: 'array'});
            parseExcelToDashboard(workbook);
            
            // Thành công
            icon.setAttribute('data-lucide', 'check-circle');
            icon.style.color = 'var(--ghn-green)';
            lucide.createIcons();
            
            setTimeout(() => {
                icon.setAttribute('data-lucide', originalIcon);
                icon.style.color = 'var(--ghn-orange)';
                lucide.createIcons();
            }, 3000);
            
            alert("Đã cập nhật Database thành công từ file Excel!");
        } catch (error) {
            console.error(error);
            alert("Lỗi đọc file Excel. Sếp kiểm tra lại định dạng file nhé!");
            icon.setAttribute('data-lucide', originalIcon);
            lucide.createIcons();
        }
    };
    reader.readAsArrayBuffer(file);
}

function formatExcelDate(serial) {
    if (!serial) return '';
    if (typeof serial === 'string') return serial;
    // Excel date bug offset
    const date = new Date(Math.round((serial - 25569)*86400*1000));
    return date.toLocaleDateString('vi-VN');
}

function parseExcelToDashboard(workbook) {
    let newAllocations = [];
    let newForklifts = [];
    let newInfraHealth = [];
    
    // 1. Cấp phát các BC
    if (workbook.Sheets['Cấp phát các BC']) {
        const data = XLSX.utils.sheet_to_json(workbook.Sheets['Cấp phát các BC'], {header: 1});
        for (let i = 1; i < data.length; i++) {
            let row = data[i];
            if (row[0] && row[0] !== 'NGÀY THÁNG NĂM' && row[0] !== 'Ngày tháng năm') {
                newAllocations.push({
                    date: formatExcelDate(row[0]),
                    bc: row[1] || 'N/A',
                    item: row[2] || 'N/A',
                    quantity: Number(row[3]) || 0,
                    unit: row[4] || 'N/A',
                    location: row[5] || 'N/A',
                    issuer: row[6] || 'N/A'
                });
            }
        }
    }
    
    // 2. Nhật ký xe nâng
    if (workbook.Sheets['Nhật ký xe nâng']) {
        const data = XLSX.utils.sheet_to_json(workbook.Sheets['Nhật ký xe nâng'], {header: 1});
        for (let i = 1; i < data.length; i++) {
            let row = data[i];
            if (row[0] && row[0] !== 'Nhà cung cấp' && row[0] !== 'NHÀ CUNG CẤP') {
                newForklifts.push({
                    supplier: row[0] || 'N/A',
                    code: row[1] || 'N/A',
                    issueTime: formatExcelDate(row[2]),
                    issueType: row[3] || 'N/A',
                    fixTime: formatExcelDate(row[4]),
                    note: row[5] || ''
                });
            }
        }
    }
    
    // 3. KiemTraHaTang
    if (workbook.Sheets['KiemTraHaTang']) {
        const data = XLSX.utils.sheet_to_json(workbook.Sheets['KiemTraHaTang'], {header: 1});
        for (let i = 1; i < data.length; i++) {
            let row = data[i];
            if (row[0] && row[0] !== 'Ngày kiểm tra' && row[0] !== 'Ngày') {
                newInfraHealth.push({
                    date: formatExcelDate(row[0]),
                    group: row[1] || 'N/A',
                    item: row[2] || 'N/A',
                    status: row[3] || 'N/A',
                    desc: row[4] || '',
                    action: row[5] || '-',
                    inspector: row[6] || 'N/A'
                });
            }
        }
    }
    
    // Cập nhật biến global và render lại
    if (!window.ghnMaterialsData) window.ghnMaterialsData = {};
    if(newAllocations.length > 0) ghnMaterialsData.allocations = newAllocations;
    if(newForklifts.length > 0) ghnMaterialsData.forklifts = newForklifts;
    if(newInfraHealth.length > 0) ghnMaterialsData.infraHealth = newInfraHealth;
    
    // Gọi lại hàm render
    initDashboard();
}

// ==========================================
// TICKET MODAL LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnCreateTicket = document.getElementById('btn-create-ticket');
    const ticketModal = document.getElementById('ticket-modal');
    const closeTicketModal = document.getElementById('close-ticket-modal');
    const ticketForm = document.getElementById('ticket-form');
    const aiAdviceBox = document.getElementById('ticket-ai-advice');
    const aiContent = document.getElementById('ticket-ai-content');
    const btnSubmitTicket = document.getElementById('btn-submit-ticket');
    const btnText = document.getElementById('ticket-btn-text');
    const btnIcon = document.getElementById('ticket-btn-icon');

    if(btnCreateTicket) {
        btnCreateTicket.addEventListener('click', () => {
            ticketModal.style.display = 'flex';
            aiAdviceBox.style.display = 'none';
            ticketForm.reset();
            
            // Khôi phục nút
            btnText.textContent = 'Gửi Báo Cáo & Nhận Tư Vấn AI';
            btnIcon.setAttribute('data-lucide', 'send');
            btnIcon.style.animation = 'none';
            btnSubmitTicket.disabled = false;
            btnSubmitTicket.onclick = null;
            lucide.createIcons();
        });
    }

    if(closeTicketModal) {
        closeTicketModal.addEventListener('click', () => {
            ticketModal.style.display = 'none';
        });
    }

    if(ticketForm) {
        ticketForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (btnSubmitTicket.onclick) return; // Đang ở chế độ Đóng
            
            const location = document.getElementById('ticket-location').value;
            const priority = document.getElementById('ticket-priority').value;
            const desc = document.getElementById('ticket-desc').value;
            
            // Show loading
            btnText.textContent = 'AI Đang Phân Tích...';
            btnIcon.setAttribute('data-lucide', 'loader');
            btnIcon.style.animation = 'spin 2s linear infinite';
            lucide.createIcons();
            btnSubmitTicket.disabled = true;
            
            // Construct message for AI
            const priorityText = priority === 'CRITICAL' ? 'Nghiêm trọng (ĐỎ)' : (priority === 'WARNING' ? 'Cảnh báo (VÀNG)' : 'Thông thường (XANH)');
            const message = `SỰ CỐ KHẨN CẤP: Tôi vừa phát hiện sự cố tại khu vực: ${location}. Mức độ: ${priorityText}. Mô tả hiện tượng: ${desc}. Là Kỹ Sư Trưởng, hãy đánh giá mức độ rủi ro và đưa ra 3 bước sơ cứu/xử lý tạm thời ngay lập tức trước khi đội bảo trì đến. Trình bày dưới dạng gạch đầu dòng ngắn gọn.`;
            
            try {
                const response = await fetch(`${REPORT_API_URL}?action=chat&message=${encodeURIComponent(message)}`, {
                    method: 'GET'
                });
                
                const data = await response.json();
                
                // Show AI Advice
                aiContent.innerHTML = data.reply ? data.reply.replace(/\n/g, '<br>') : 'Không nhận được phản hồi từ AI.';
                aiAdviceBox.style.display = 'block';
                
                // Change button to "Đóng" since we don't save to DB yet
                btnText.textContent = 'Hoàn tất & Đóng';
                btnIcon.setAttribute('data-lucide', 'check');
                btnIcon.style.animation = 'none';
                lucide.createIcons();
                
                btnSubmitTicket.onclick = (ev) => {
                    ev.preventDefault();
                    ticketModal.style.display = 'none';
                    // Sẽ thêm logic đẩy lên Data Excel/Google Sheet vào tương lai
                };
                
                btnSubmitTicket.disabled = false;
                
            } catch (error) {
                console.error('Lỗi khi gọi AI:', error);
                aiContent.innerHTML = '<span style="color:var(--ghn-red)">Lỗi kết nối đến Kỹ Sư Trưởng AI. Vui lòng thử lại sau.</span>';
                aiAdviceBox.style.display = 'block';
                
                btnText.textContent = 'Thử Lại';
                btnIcon.setAttribute('data-lucide', 'rotate-cw');
                btnIcon.style.animation = 'none';
                lucide.createIcons();
                btnSubmitTicket.disabled = false;
            }
        });
    }
});

// ==========================================
// USER MANAGEMENT MODULE (ONLINE / BACKEND API)
// ==========================================
let onlineUsers = [];
let currentUserEditing = null;

const allMenus = [
    { id: 'overview', name: 'Tổng Quan' },
    { id: 'post-offices', name: 'Bưu Cục & Hạ Tầng' },
    { id: 'trends', name: 'Xu Hướng' },
    { id: 'materials', name: 'Vật Tư Cấp Phát' },
    { id: 'forklifts', name: 'Nhật Ký Xe Nâng' },
    { id: 'infra-health', name: 'Sức Khỏe Kho' },
    { id: 'purchases', name: 'Tình Trạng Đặt Mua' },
    { id: 'transport-map', name: 'Bản Đồ Vận Tải' },
    { id: 'ccdc-device', name: 'CCDC Thiết Bị' },
    { id: 'ccdc-report', name: 'Quản Lý Thiết Bị' }
];

async function initUserManagement() {
    if (localStorage.getItem('ghn_user_role') !== 'admin') return;
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');

    await fetchUsersFromBackend();

    // Event Listeners cho Modal User
    const btnAddUser = document.getElementById('btn-add-user');
    const modalUserForm = document.getElementById('modal-user-form');
    const closeUserModal = document.getElementById('close-user-modal');
    const userForm = document.getElementById('user-form');

    if (btnAddUser) {
        btnAddUser.addEventListener('click', () => {
            currentUserEditing = null;
            document.getElementById('modal-user-title').textContent = 'Thêm Tài Khoản Mới';
            userForm.reset();
            document.getElementById('um-msnv').readOnly = false;
            modalUserForm.style.display = 'flex';
        });
    }

    if (closeUserModal) closeUserModal.addEventListener('click', () => modalUserForm.style.display = 'none');

    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = userForm.querySelector('button[type="submit"]');
            btn.textContent = 'Đang lưu dữ liệu lên Server...';
            btn.disabled = true;

            const msnv = document.getElementById('um-msnv').value.trim().toUpperCase();
            const password = document.getElementById('um-password').value;
            const fullname = document.getElementById('um-fullname').value;
            const chatid = document.getElementById('um-chatid').value;
            const role = document.getElementById('um-role').value;

            const url = currentUserEditing 
                ? `${APPS_SCRIPT_URL}?action=update_user&msnv=${msnv}&password=${password}&fullname=${encodeURIComponent(fullname)}&role=${role}&chatid=${chatid}`
                : `${APPS_SCRIPT_URL}?action=create_user&msnv=${msnv}&password=${password}&fullname=${encodeURIComponent(fullname)}&role=${role}&chatid=${chatid}`;

            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.status === 'success') {
                    alert(currentUserEditing ? 'Đã cập nhật thành công!' : 'Tạo tài khoản mới thành công!');
                    await fetchUsersFromBackend();
                    modalUserForm.style.display = 'none';
                } else {
                    alert('Lỗi: ' + data.message);
                }
            } catch (err) {
                alert('Lỗi kết nối tới Server!');
            } finally {
                btn.textContent = 'Lưu Tài Khoản';
                btn.disabled = false;
            }
        });
    }

    // Event Listeners cho Modal Phân Quyền
    const modalPermissions = document.getElementById('modal-permissions');
    const closePermModal = document.getElementById('close-perm-modal');
    const btnSavePerm = document.getElementById('btn-save-permissions');

    if (closePermModal) closePermModal.addEventListener('click', () => modalPermissions.style.display = 'none');
    
    if (btnSavePerm) {
        btnSavePerm.addEventListener('click', async () => {
            if(!currentUserEditing) return;
            btnSavePerm.textContent = 'Đang cập nhật phân quyền...';
            btnSavePerm.disabled = true;

            const newPerms = [];
            document.querySelectorAll('.perm-checkbox').forEach(cb => {
                if(cb.checked) newPerms.push(cb.value);
            });
            const permsStr = newPerms.join(',');

            try {
                const url = `${APPS_SCRIPT_URL}?action=update_user&msnv=${currentUserEditing}&permissions=${encodeURIComponent(permsStr)}`;
                const response = await fetch(url);
                const data = await response.json();
                if (data.status === 'success') {
                    alert('Lưu phân quyền thành công!');
                    await fetchUsersFromBackend();
                    modalPermissions.style.display = 'none';
                } else {
                    alert('Lỗi: ' + data.message);
                }
            } catch (err) {
                alert('Lỗi kết nối tới Server!');
            } finally {
                btnSavePerm.textContent = 'Lưu Phân Quyền';
                btnSavePerm.disabled = false;
            }
        });
    }
}

async function fetchUsersFromBackend() {
    const tbody = document.querySelector('#usersTable tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Đang tải danh sách từ Google Server...</td></tr>';
    
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=get_users`);
        const data = await response.json();
        if (data.status === 'success') {
            onlineUsers = data.data;
            renderUserTable();
        }
    } catch (err) {
        console.error(err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--status-red);">Không thể kết nối đến Google Apps Script. Cần cập nhật URL.</td></tr>';
    }
}

function renderUserTable() {
    const tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    onlineUsers.forEach(user => {
        const tr = document.createElement('tr');
        
        const roleBadge = user.role === 'admin' 
            ? '<span class="status-badge warning">Admin</span>' 
            : '<span class="status-badge neutral">User</span>';
            
        let statusBadge = '';
        let lockIcon = '';
        let lockColor = '';
        let newStatusToggle = '';

        if (user.status === 'active') {
            statusBadge = '<span class="status-badge safe">Hoạt động</span>';
            lockIcon = 'lock';
            lockColor = 'var(--ghn-orange)';
            newStatusToggle = 'locked';
        } else if (user.status === 'pending') {
            statusBadge = '<span class="status-badge warning" style="background: rgba(234, 179, 8, 0.15); color: #eab308;">Chờ duyệt</span>';
            lockIcon = 'check-circle';
            lockColor = 'var(--status-green)';
            newStatusToggle = 'active';
        } else {
            statusBadge = '<span class="status-badge critical">Đã Khóa</span>';
            lockIcon = 'unlock';
            lockColor = 'var(--status-green)';
            newStatusToggle = 'active';
        }

        tr.innerHTML = `
            <td><strong>${escapeHtml(user.msnv)}</strong></td>
            <td>${escapeHtml(user.fullname)}</td>
            <td>${roleBadge}</td>
            <td><code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${escapeHtml(user.chatid || 'N/A')}</code></td>
            <td>${statusBadge}</td>
            <td class="text-right">
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="icon-btn" onclick="openEditUser('${escapeHtml(user.msnv)}')" title="Chỉnh sửa"><i data-lucide="edit-2"></i></button>
                    <button class="icon-btn" onclick="openPermissions('${escapeHtml(user.msnv)}')" title="Phân Quyền" style="color: var(--ghn-orange);"><i data-lucide="settings"></i></button>
                    <button class="icon-btn" onclick="toggleLockUser('${escapeHtml(user.msnv)}', '${escapeHtml(user.status)}', '${escapeHtml(newStatusToggle)}')" title="Khóa/Mở Khóa/Duyệt" style="color: ${lockColor};"><i data-lucide="${lockIcon}"></i></button>
                    <button class="icon-btn" onclick="deleteUser('${escapeHtml(user.msnv)}')" title="Xóa" style="color: var(--status-red);"><i data-lucide="trash-2"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

window.openEditUser = function(msnv) {
    const user = onlineUsers.find(u => u.msnv === msnv);
    if (!user) return;
    currentUserEditing = msnv;
    document.getElementById('modal-user-title').textContent = 'Sửa Tài Khoản: ' + msnv;
    document.getElementById('um-msnv').value = user.msnv;
    document.getElementById('um-msnv').readOnly = true;
    document.getElementById('um-password').value = '';
    document.getElementById('um-fullname').value = user.fullname;
    document.getElementById('um-chatid').value = user.chatid;
    document.getElementById('um-role').value = user.role;
    document.getElementById('modal-user-form').style.display = 'flex';
};

window.openPermissions = function(msnv) {
    const user = onlineUsers.find(u => u.msnv === msnv);
    if (!user) return;
    currentUserEditing = msnv;
    document.getElementById('perm-user-name').textContent = user.fullname + ' (' + msnv + ')';
    
    const container = document.getElementById('permission-list-container');
    container.innerHTML = '';
    
    allMenus.forEach(menu => {
        const isChecked = user.permissions.includes(menu.id) ? 'checked' : '';
        const html = `
            <div class="permission-item">
                <div class="permission-info">
                    <i data-lucide="layout"></i>
                    <span style="font-size: 14px; color: var(--text-primary); font-weight: 500;">${menu.name}</span>
                </div>
                <label class="switch">
                    <input type="checkbox" class="perm-checkbox" value="${menu.id}" ${isChecked}>
                    <span class="slider round"></span>
                </label>
            </div>
        `;
        container.innerHTML += html;
    });
    lucide.createIcons();
    document.getElementById('modal-permissions').style.display = 'flex';
};

window.toggleLockUser = async function(msnv, currentStatus, newStatusToggle) {
    if (msnv === 'ADMIN001') { alert('Sếp không thể tự khóa tài khoản Super Admin của mình!'); return; }
    const newStatus = newStatusToggle;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=update_user&msnv=${msnv}&status=${newStatus}`);
        const data = await response.json();
        if(data.status === 'success') {
            await fetchUsersFromBackend();
        }
    } catch(err) {
        alert('Lỗi kết nối khi khóa/mở khóa!');
    }
};

window.deleteUser = async function(msnv) {
    if (msnv === 'ADMIN001') { alert('Không thể xóa Super Admin!'); return; }
    if (confirm('Sếp có chắc chắn muốn XÓA VĨNH VIỄN tài khoản ' + msnv + ' không? Thao tác này sẽ xóa dữ liệu trên Google Sheet.')) {
        try {
            const response = await fetch(`${APPS_SCRIPT_URL}?action=delete_user&msnv=${msnv}`);
            const data = await response.json();
            if(data.status === 'success') {
                await fetchUsersFromBackend();
            }
        } catch(err) {
            alert('Lỗi kết nối khi xóa tài khoản!');
        }
    }
};

// =============================================
// CCDC MODULE — Quản Lý Thiết Bị (QR Scan)
// Tất cả biến/hàm dùng prefix ccdc_ để tránh xung đột
// =============================================

// Thêm keyframe animation vào <head> nếu chưa có
(function() {
    if (!document.getElementById('ccdc-styles')) {
        const s = document.createElement('style');
        s.id = 'ccdc-styles';
        s.textContent = `
            @keyframes ccdcPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
            #ccdc-scan-input:focus { border-color:#f26522 !important; box-shadow: 0 0 0 4px rgba(242,101,34,0.12) !important; }
            .ccdc-info-box { background:rgba(255,255,255,0.05); border-radius:10px; padding:11px 14px; }
            .ccdc-info-label { font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; font-weight:600; }
            .ccdc-info-value { font-size:14px; font-weight:600; margin-top:4px; }
            .ccdc-borrow-row { background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:10px; padding:11px 14px; margin-bottom:8px; cursor:pointer; display:flex; align-items:center; gap:12px; transition:all 0.2s; }
            .ccdc-borrow-row:hover, .ccdc-borrow-row.selected { border-color:#27ae60; background:rgba(39,174,96,0.08); }
            .ccdc-borrow-radio { width:17px; height:17px; border-radius:50%; border:2px solid rgba(255,255,255,0.2); flex-shrink:0; }
            .ccdc-borrow-row.selected .ccdc-borrow-radio { border-color:#27ae60; background:#27ae60; position:relative; }
            .ccdc-borrow-row.selected .ccdc-borrow-radio::after { content:''; position:absolute; width:6px; height:6px; background:#fff; border-radius:50%; top:50%; left:50%; transform:translate(-50%,-50%); }
        `;
        document.head.appendChild(s);
    }
})();

// === STATE ===
let ccdc_mode = 'giao';
let ccdc_empData = null;
let ccdc_selectedBorrow = null;
let ccdc_borrowList = [];

// === SWITCH TAB (GIAO / NHẬN) ===
function ccdcSwitchTab(mode) {
    ccdc_mode = mode;
    ccdc_empData = null;
    ccdc_selectedBorrow = null;
    ccdc_borrowList = [];
    ccdcCloseResult();

    const inp = document.getElementById('ccdc-scan-input');
    const title = document.getElementById('ccdc-scan-title');
    const btnGiao = document.getElementById('ccdc-tab-giao');
    const btnNhan = document.getElementById('ccdc-tab-nhan');
    if (!inp) return;

    if (mode === 'giao') {
        if (title) title.textContent = 'QUÉT QR — GIAO THIẾT BỊ';
        inp.style.borderColor = 'rgba(255,255,255,0.1)';
        inp.placeholder = 'Scan QR hoặc nhập Mã NV rồi nhấn Enter...';
        if (btnGiao) { btnGiao.style.background='linear-gradient(135deg,#f26522,#e55a1c)'; btnGiao.style.color='#fff'; btnGiao.style.border='none'; }
        if (btnNhan) { btnNhan.style.background='rgba(39,174,96,0.15)'; btnNhan.style.color='#27ae60'; btnNhan.style.border='1px solid rgba(39,174,96,0.35)'; }
    } else {
        if (title) title.textContent = 'QUÉT QR — NHẬN THIẾT BỊ';
        inp.placeholder = 'Scan QR hoặc nhập Mã NV để tra thiết bị đang mượn...';
        if (btnNhan) { btnNhan.style.background='linear-gradient(135deg,#27ae60,#219150)'; btnNhan.style.color='#fff'; btnNhan.style.border='none'; }
        if (btnGiao) { btnGiao.style.background='rgba(242,101,34,0.15)'; btnGiao.style.color='#f26522'; btnGiao.style.border='1px solid rgba(242,101,34,0.35)'; }
    }
    inp.value = '';
    inp.focus();
}

// === XỬ LÝ SCAN ===
let ccdc_speechEnabled = localStorage.getItem('ccdc_speech_enabled') !== 'false';
let ccdc_audioPlayer = null; // Quản lý đối tượng phát âm thanh để dừng khi cần

function ccdcSpeak(text) {
    if (!ccdc_speechEnabled) return;
    
    // Dừng âm thanh đang phát trước đó nếu có
    if (ccdc_audioPlayer) {
        try {
            ccdc_audioPlayer.pause();
        } catch (e) {}
        ccdc_audioPlayer = null;
    }
    
    // Ưu tiên cách 1: Gọi API Google Translate TTS để lấy giọng tiếng Việt chuẩn tự nhiên của Google Assistant
    try {
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
        const audio = new Audio(ttsUrl);
        ccdc_audioPlayer = audio;
        
        audio.play().catch(err => {
            console.warn("Google TTS play blocked by browser autoplay policy, trying Web Speech API fallback:", err);
            ccdcSpeakFallbackWebSpeech(text);
        });
    } catch (e) {
        console.error("Google TTS error, using Web Speech API fallback:", e);
        ccdcSpeakFallbackWebSpeech(text);
    }
}

function ccdcSpeakFallbackWebSpeech(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Dừng câu nói trước đó
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        
        // Tìm giọng tiếng Việt chính xác
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(v => {
            const l = v.lang.toLowerCase();
            return l === 'vi-vn' || l.startsWith('vi');
        });
        
        if (viVoice) {
            utterance.voice = viVoice;
        }
        
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

function ccdcSpeakEmployee(emp, mode) {
    const name = emp.hoten || 'Chưa rõ tên';
    const manager = emp.quanly || 'Chưa có thông tin quản lý trực tiếp';
    
    let text = '';
    if (mode === 'giao') {
        text = `Giao thiết bị cho ${name}. Quản lý trực tiếp là ${manager}`;
    } else if (mode === 'nhan') {
        text = `Thu hồi thiết bị của ${name}. Quản lý trực tiếp là ${manager}`;
    } else if (mode === 'no_borrow') {
        text = `${name}. Không có thiết bị đang mượn`;
    }
    
    ccdcSpeak(text);
}

window.ccdcToggleVoice = function() {
    ccdc_speechEnabled = !ccdc_speechEnabled;
    localStorage.setItem('ccdc_speech_enabled', ccdc_speechEnabled);
    ccdcUpdateVoiceUI();
};

function ccdcUpdateVoiceUI() {
    const btn = document.getElementById('ccdc-voice-toggle');
    const icon = document.getElementById('ccdc-voice-icon');
    const text = document.getElementById('ccdc-voice-text');
    if (!btn || !icon || !text) return;
    
    if (ccdc_speechEnabled) {
        icon.setAttribute('data-lucide', 'volume-2');
        icon.style.color = 'var(--ghn-orange)';
        text.textContent = 'Đọc âm thanh: BẬT';
        btn.style.background = 'rgba(242,101,34,0.1)';
        btn.style.color = 'var(--ghn-orange)';
    } else {
        icon.setAttribute('data-lucide', 'volume-x');
        icon.style.color = 'var(--text-muted)';
        text.textContent = 'Đọc âm thanh: TẮT';
        btn.style.background = 'none';
        btn.style.color = 'var(--text-muted)';
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

async function ccdcProcessScan(raw) {
    const msnv = (raw || '').trim();
    const inp  = document.getElementById('ccdc-scan-input');
    if (inp) inp.value = '';
    if (!msnv) return;

    ccdcShowLoading(true);
    try {
        if (ccdc_mode === 'giao') {
            const res = await ccdcApiCall({ action: 'lookup_employee', msnv });
            ccdcShowLoading(false);
            if (res.status === 'found') {
                ccdc_empData = res;
                ccdcShowResultGiao(res);
                ccdcSpeakEmployee(res, 'giao');
            } else {
                ccdcToast('❌ ' + (res.message || 'Không tìm thấy mã NV: ' + msnv), 'error');
                ccdcSpeak('Không tìm thấy nhân viên ' + msnv);
            }
        } else {
            const res = await ccdcApiCall({ action: 'lookup_borrowed', msnv });
            ccdcShowLoading(false);
            if (res.status === 'has_borrow') {
                ccdc_borrowList = res.borrowed;
                ccdcShowResultNhan(res.borrowed);
                const first = res.borrowed[0];
                ccdcSpeakEmployee(first, 'nhan');
            } else if (res.status === 'no_borrow') {
                const name = res.emp && res.emp.hoten ? res.emp.hoten : msnv;
                ccdcToast(`⚠️ ${name} — Không có thiết bị đang mượn`, 'error');
                if (res.emp && res.emp.status === 'found') {
                    ccdcSpeakEmployee(res.emp, 'no_borrow');
                } else {
                    ccdcSpeak(name + '. Không có thiết bị đang mượn');
                }
            } else {
                ccdcToast('❌ ' + (res.message || 'Không tìm thấy mã NV'), 'error');
                ccdcSpeak('Không tìm thấy nhân viên ' + msnv);
            }
        }
    } catch(e) {
        ccdcShowLoading(false);
        ccdcToast('❌ Lỗi kết nối tới Apps Script CCDC', 'error');
        ccdcSpeak('Lỗi kết nối hệ thống');
        console.error('[CCDC]', e);
    }
}

// === HIỂN THỊ KẾT QUẢ GIAO ===
function ccdcShowResultGiao(emp) {
    const wrap   = document.getElementById('ccdc-result-wrap');
    const header = document.getElementById('ccdc-emp-header');
    const grid   = document.getElementById('ccdc-info-grid');
    const borrow = document.getElementById('ccdc-borrow-list');
    const form   = document.getElementById('ccdc-form-fields');
    const btn    = document.getElementById('ccdc-submit-btn');
    if (!wrap) return;

    if (header) header.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:46px;height:46px;border-radius:12px;background:rgba(242,101,34,0.15);display:flex;align-items:center;justify-content:center;font-size:22px;">👤</div>
            <div>
                <div style="font-size:17px;font-weight:700;">${emp.hoten || '---'}</div>
                <div style="font-size:13px;color:var(--text-muted);margin-top:3px;">Mã NV: <strong>${emp.msnv}</strong></div>
            </div>
        </div>`;

    if (grid) grid.innerHTML = `
        <div class="ccdc-info-box"><div class="ccdc-info-label">Ca làm việc</div><div class="ccdc-info-value">${emp.ca||'---'}</div></div>
        <div class="ccdc-info-box"><div class="ccdc-info-label">Quản lý trực tiếp</div><div class="ccdc-info-value">${emp.quanly || '<span style="font-size:11px;color:var(--text-muted);font-style:italic;">Chưa cập nhật</span>'}</div></div>`;

    if (borrow) borrow.style.display = 'none';

    if (form) form.innerHTML = `
        <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">📋 Thông Tin Thiết Bị Giao</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                <div>
                    <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">Mã thiết bị <span style="color:#e74c3c">*</span></label>
                    <input id="ccdc-f-ma" type="text" placeholder="VD: TB-001" autocomplete="off"
                        style="width:100%;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 13px;color:var(--text-primary);font-size:14px;font-family:inherit;outline:none;">
                </div>
                <div>
                    <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">Tên thiết bị <span style="color:#e74c3c">*</span></label>
                    <input id="ccdc-f-ten" type="text" placeholder="VD: Máy scan barcode" autocomplete="off"
                        style="width:100%;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 13px;color:var(--text-primary);font-size:14px;font-family:inherit;outline:none;">
                </div>
            </div>
            <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">Ghi chú</label>
                <input id="ccdc-f-ghi" type="text" placeholder="Ghi chú thêm nếu cần..."
                    style="width:100%;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 13px;color:var(--text-primary);font-size:14px;font-family:inherit;outline:none;">
            </div>
        </div>`;

    if (btn) {
        btn.style.background = 'linear-gradient(135deg,#f26522,#e55a1c)';
        btn.style.color = '#fff';
        btn.style.boxShadow = '0 4px 14px rgba(242,101,34,0.4)';
        btn.innerHTML = '✅ Xác Nhận Giao';
    }

    wrap.style.display = 'block';
    setTimeout(() => { document.getElementById('ccdc-f-ma')?.focus(); }, 80);
    lucide && lucide.createIcons();
}

// === HIỂN THỊ KẾT QUẢ NHẬN ===
function ccdcShowResultNhan(borrowedList) {
    ccdc_selectedBorrow = borrowedList.length === 1 ? borrowedList[0] : null;
    const wrap   = document.getElementById('ccdc-result-wrap');
    const header = document.getElementById('ccdc-emp-header');
    const grid   = document.getElementById('ccdc-info-grid');
    const borrow = document.getElementById('ccdc-borrow-list');
    const form   = document.getElementById('ccdc-form-fields');
    const btn    = document.getElementById('ccdc-submit-btn');
    const first  = borrowedList[0];
    if (!wrap) return;

    if (header) header.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:46px;height:46px;border-radius:12px;background:rgba(39,174,96,0.15);display:flex;align-items:center;justify-content:center;font-size:22px;">👤</div>
            <div>
                <div style="font-size:17px;font-weight:700;">${first.hoten||'---'}</div>
                <div style="font-size:13px;color:var(--text-muted);margin-top:3px;">Mã NV: <strong>${first.msnv}</strong> &nbsp;·&nbsp; Ca: ${first.ca||'---'}</div>
            </div>
        </div>`;

    if (grid) grid.innerHTML = `
        <div class="ccdc-info-box"><div class="ccdc-info-label">Ca làm việc</div><div class="ccdc-info-value">${first.ca||'---'}</div></div>
        <div class="ccdc-info-box"><div class="ccdc-info-label">Quản lý trực tiếp</div><div class="ccdc-info-value">${first.quanly || '<span style="font-size:11px;color:var(--text-muted);font-style:italic;">Chưa cập nhật</span>'}</div></div>`;

    const rowsHtml = borrowedList.map((b, i) => `
        <div class="ccdc-borrow-row ${ccdc_selectedBorrow === b ? 'selected' : ''}" id="ccdc-brow-${i}" onclick="ccdcSelectBorrow(${i})">
            <div class="ccdc-borrow-radio" id="ccdc-radio-${i}"></div>
            <div style="flex:1;">
                <div style="font-size:12px;color:var(--text-muted);">Mã TB: <strong>${b.ma_thiet_bi}</strong> &nbsp;·&nbsp; Giao: ${b.timestamp.substring(0,16)}</div>
                <div style="font-size:14px;font-weight:600;margin-top:2px;">${b.ten_thiet_bi}</div>
            </div>
            <span>📦</span>
        </div>`).join('');

    if (borrow) { borrow.style.display = 'block'; borrow.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">
            📦 Thiết Bị Đang Mượn ${borrowedList.length > 1 ? '(chọn thiết bị cần thu hồi)' : ''}
        </div>
        ${rowsHtml}`; }

    if (form) form.innerHTML = `
        <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;">
            <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">Tình trạng thiết bị khi nhận lại <span style="color:#e74c3c">*</span></label>
                <input id="ccdc-f-tinh" type="text" placeholder="VD: Tốt / Hỏng màn hình / Cần sạc pin..."
                    style="width:100%;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 13px;color:var(--text-primary);font-size:14px;font-family:inherit;outline:none;margin-bottom:10px;">
            </div>
            <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">Ghi chú</label>
                <input id="ccdc-f-ghi2" type="text" placeholder="Ghi chú thêm nếu cần..."
                    style="width:100%;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 13px;color:var(--text-primary);font-size:14px;font-family:inherit;outline:none;">
            </div>
        </div>`;

    if (btn) {
        btn.style.background = 'linear-gradient(135deg,#27ae60,#219150)';
        btn.style.color = '#fff';
        btn.style.boxShadow = '0 4px 14px rgba(39,174,96,0.4)';
        btn.innerHTML = '✅ Xác Nhận Nhận';
    }
    wrap.style.display = 'block';
    setTimeout(() => { document.getElementById('ccdc-f-tinh')?.focus(); }, 80);
}

function ccdcSelectBorrow(idx) {
    ccdc_selectedBorrow = ccdc_borrowList[idx];
    document.querySelectorAll('.ccdc-borrow-row').forEach((el, i) => el.classList.toggle('selected', i === idx));
}

// === SUBMIT ===
async function ccdcSubmit() {
    const btn = document.getElementById('ccdc-submit-btn');
    if (!btn) return;

    // Thông tin người thao tác (nhân viên CCDC đang đăng nhập)
    const op_msnv    = localStorage.getItem('ghn_user_msnv')    || '';
    const op_fullname = localStorage.getItem('ghn_user_fullname') || '';
    const nguoi_thao_tac = op_fullname ? `${op_msnv} - ${op_fullname}` : op_msnv;

    if (ccdc_mode === 'giao') {
        const ma  = document.getElementById('ccdc-f-ma')?.value.trim();
        const ten = document.getElementById('ccdc-f-ten')?.value.trim();
        const ghi = document.getElementById('ccdc-f-ghi')?.value.trim() || '';
        if (!ma)  { ccdcToast('⚠️ Vui lòng nhập Mã Thiết Bị', 'error'); return; }
        if (!ten) { ccdcToast('⚠️ Vui lòng nhập Tên Thiết Bị', 'error'); return; }
        btn.disabled = true; btn.innerHTML = '⏳ Đang lưu...';
        try {
            const res = await ccdcApiCall({
                action:'submit_giao', msnv:ccdc_empData.msnv, hoten:ccdc_empData.hoten,
                ca:ccdc_empData.ca, quanly:ccdc_empData.quanly,
                ma_thiet_bi:ma, ten_thiet_bi:ten, ghi_chu:ghi,
                nguoi_thao_tac: nguoi_thao_tac
            });
            if (res.status === 'success') {
                ccdcCloseResult();
                ccdcToast(`✅ Đã giao "${ten}" cho ${ccdc_empData.hoten}`, 'success');
                ccdcLoadLog();
            } else { ccdcToast('❌ ' + (res.message || 'Lỗi lưu'), 'error'); }
        } catch(e) { ccdcToast('❌ Lỗi kết nối', 'error'); }
        btn.disabled = false; btn.innerHTML = '✅ Xác Nhận Giao';

    } else {
        if (!ccdc_selectedBorrow) { ccdcToast('⚠️ Vui lòng chọn thiết bị cần thu hồi', 'error'); return; }
        const tinh = document.getElementById('ccdc-f-tinh')?.value.trim();
        const ghi2 = document.getElementById('ccdc-f-ghi2')?.value.trim() || '';
        if (!tinh) { ccdcToast('⚠️ Vui lòng nhập Tình trạng thiết bị', 'error'); return; }
        btn.disabled = true; btn.innerHTML = '⏳ Đang lưu...';
        try {
            const res = await ccdcApiCall({
                action:'submit_nhan', msnv:ccdc_selectedBorrow.msnv,
                ma_thiet_bi:ccdc_selectedBorrow.ma_thiet_bi,
                tinh_trang:tinh, ghi_chu:ghi2,
                row_index:ccdc_selectedBorrow.row_index,
                nguoi_thao_tac: nguoi_thao_tac
            });
            if (res.status === 'success') {
                ccdcCloseResult();
                ccdcToast(`✅ Đã nhận lại "${ccdc_selectedBorrow.ten_thiet_bi}" từ ${ccdc_selectedBorrow.hoten}`, 'success');
                ccdcLoadLog();
            } else { ccdcToast('❌ ' + (res.message || 'Lỗi lưu'), 'error'); }
        } catch(e) { ccdcToast('❌ Lỗi kết nối', 'error'); }
        btn.disabled = false; btn.innerHTML = '✅ Xác Nhận Nhận';
    }
}

// === LOAD LOG ===
async function ccdcLoadLog() {
    const tbody = document.getElementById('ccdc-log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Đang tải...</td></tr>';
    try {
        const res = await ccdcApiCall({ action: 'get_today_log' });
        if (res.status === 'success' && res.log && res.log.length > 0) {
            tbody.innerHTML = res.log.map(r => `
                <tr>
                    <td style="white-space:nowrap;font-size:12px;color:var(--text-muted);">${r.timestamp.substring(0,16)}</td>
                    <td><strong>${r.msnv}</strong></td>
                    <td>${r.hoten}</td>
                    <td><code style="background:rgba(255,255,255,0.07);padding:2px 8px;border-radius:6px;font-size:12px;">${r.ma_thiet_bi}</code></td>
                    <td>${r.ten_thiet_bi}</td>
                    <td class="text-center">
                        ${r.da_thu_hoi
                            ? '<span class="status-badge safe">✅ Đã nhận</span>'
                            : '<span class="status-badge warning">🔵 Đang mượn</span>'
                        }
                    </td>
                    <td style="font-size:12px;color:var(--text-muted);">${r.nguoi_thao_tac || '<span style="opacity:0.4">—</span>'}</td>
                </tr>`).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px;">Chưa có giao dịch nào hôm nay</td></tr>';
        }

    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#e74c3c;padding:24px;">⚠️ Không tải được dữ liệu</td></tr>';
    }
}

// === HELPERS ===
function ccdcCloseResult() {
    const wrap = document.getElementById('ccdc-result-wrap');
    if (wrap) wrap.style.display = 'none';
    ccdc_empData = null; ccdc_selectedBorrow = null; ccdc_borrowList = [];
    document.getElementById('ccdc-scan-input')?.focus();
}

function ccdcShowLoading(show) {
    // Dùng lại loading overlay của dashboard nếu có, nếu không thì hiển thị inline
    const title = document.getElementById('ccdc-scan-title');
    if (title) title.textContent = show ? '🔄 Đang tra cứu...' : (ccdc_mode === 'giao' ? 'QUÉT QR — GIAO THIẾT BỊ' : 'QUÉT QR — NHẬN THIẾT BỊ');
}

let ccdc_toastTimer;
function ccdcToast(msg, type='success') {
    // Tái sử dụng toast của dashboard nếu có
    const existing = document.getElementById('toast-notification') || document.querySelector('.toast');
    if (existing) {
        existing.textContent = msg;
        existing.style.display = 'block';
        clearTimeout(ccdc_toastTimer);
        ccdc_toastTimer = setTimeout(() => { existing.style.display = 'none'; }, 3500);
        return;
    }
    // Fallback: tạo toast tạm
    let t = document.getElementById('ccdc-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'ccdc-toast';
        t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 22px;border-radius:12px;font-size:14px;font-weight:600;z-index:9999;transition:all 0.3s;max-width:90vw;text-align:center;';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = type === 'success' ? 'rgba(39,174,96,0.95)' : 'rgba(231,76,60,0.95)';
    t.style.color = '#fff';
    t.style.display = 'block';
    t.style.opacity = '1';
    clearTimeout(ccdc_toastTimer);
    ccdc_toastTimer = setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.style.display='none',300); }, 3500);
}

async function ccdcApiCall(params) {
    const baseUrl = (typeof CCDC_API_URL !== 'undefined' && CCDC_API_URL)
        ? CCDC_API_URL
        : (typeof APPS_SCRIPT_URL !== 'undefined' ? APPS_SCRIPT_URL : '');
    if (!baseUrl) throw new Error('Chưa cấu hình CCDC_API_URL');

    // Lọc bỏ undefined/null, ép về string
    const qs = Object.entries(params)
        .filter(([k, v]) => v !== undefined && v !== null)
        .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
        .join('&');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(baseUrl + '?' + qs, {
            redirect: 'follow',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    } catch(e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') throw new Error('Timeout — kiểm tra kết nối mạng');
        throw e;
    }
}


// Auto-focus scan input khi chuyển sang module CCDC
document.querySelectorAll('.nav-item[data-target="ccdc-device"]').forEach(nav => {
    nav.addEventListener('click', () => {
        setTimeout(() => {
            const inp = document.getElementById('ccdc-scan-input');
            if (inp) inp.focus();
            ccdcLoadLog();
        }, 150);
    });
});

// === CCDC REPORT LOGIC (BÁO CÁO THIẾT BỊ) ===
let ccdcReportData = [];

async function ccdcReportLoad() {
    const tbody = document.getElementById('ccdc-report-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">🔄 Đang tải lịch sử cấp phát từ Google Server...</td></tr>';
    }

    try {
        const res = await ccdcApiCall({ action: 'ccdc_get_all_logs' });
        if (res && res.status === 'success' && Array.isArray(res.log)) {
            ccdcReportData = res.log;
            ccdcReportUpdateKPIs(ccdcReportData);
            ccdcReportRender(ccdcReportData);
        } else {
            throw new Error('Dữ liệu không đúng định dạng');
        }
    } catch (err) {
        console.error('[CCDC Report]', err);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px 20px; color: var(--status-red);">⚠️ Lỗi không thể tải dữ liệu: ' + escapeHtml(err.message || err) + '</td></tr>';
        }
    }
}

function ccdcReportUpdateKPIs(log) {
    const total = log.length;
    const active = log.filter(item => !item.da_thu_hoi).length;
    const returned = log.filter(item => item.da_thu_hoi).length;
    const rate = total > 0 ? Math.round((returned / total) * 100) : 0;

    const kpiTotal = document.getElementById('ccdc-kpi-total');
    const kpiActive = document.getElementById('ccdc-kpi-active');
    const kpiReturned = document.getElementById('ccdc-kpi-returned');
    const kpiRate = document.getElementById('ccdc-kpi-rate');

    if (kpiTotal) kpiTotal.textContent = total;
    if (kpiActive) kpiActive.textContent = active;
    if (kpiReturned) kpiReturned.textContent = returned;
    if (kpiRate) kpiRate.textContent = rate + '%';
}

function ccdcReportRender(list) {
    const tbody = document.getElementById('ccdc-report-tbody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">Chưa có dữ liệu nào khớp với bộ lọc</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(item => {
        let statusBadge = '';
        if (item.da_thu_hoi) {
            statusBadge = `
                <span class="status-badge safe" style="display:inline-block; margin-bottom:4px;">Đã thu hồi</span>
                <div style="font-size:11px; color:var(--text-muted); line-height:1.3;">
                    Trả lúc: ${escapeHtml(item.thu_hoi_luc.substring(0, 16))}<br>
                    Tình trạng: <strong>${escapeHtml(item.tinh_trang)}</strong>
                </div>
            `;
        } else {
            statusBadge = '<span class="status-badge warning">Đang mượn</span>';
        }

        const note = item.ghi_chu ? escapeHtml(item.ghi_chu) : '<span style="font-style:italic;color:var(--text-muted);font-size:12px;">Không có</span>';
        const operatorInfo = item.nguoi_thao_tac ? `<br><span style="font-size:11px;color:var(--text-muted);">Thực hiện: ${escapeHtml(item.nguoi_thao_tac)}</span>` : '';

        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)';" onmouseout="this.style.background='transparent';">
                <td style="padding: 14px 20px; font-size: 14px;">
                    ${escapeHtml(item.timestamp.substring(0, 16))}
                </td>
                <td style="padding: 14px 20px; font-size: 14px;">
                    <strong style="color:var(--text-primary);">${escapeHtml(item.hoten)}</strong>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Mã số: ${escapeHtml(item.msnv)}</div>
                </td>
                <td style="padding: 14px 20px; font-size: 14px;">
                    <div>Ca: ${escapeHtml(item.ca || 'N/A')}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">QL: ${escapeHtml(item.quanly || 'N/A')}</div>
                </td>
                <td style="padding: 14px 20px; font-size: 14px;">
                    <strong style="color:var(--ghn-orange);">${escapeHtml(item.ma_thiet_bi)}</strong>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${escapeHtml(item.ten_thiet_bi)}</div>
                </td>
                <td style="padding: 14px 20px; font-size: 14px;">
                    ${statusBadge}
                    ${operatorInfo}
                </td>
                <td style="padding: 14px 20px; font-size: 14px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${note}">
                    ${note}
                </td>
            </tr>
        `;
    }).join('');
}

window.ccdcReportFilter = function() {
    const q = document.getElementById('ccdc-rep-search').value.trim().toLowerCase();
    const status = document.getElementById('ccdc-rep-filter-status').value;

    const filtered = ccdcReportData.filter(item => {
        // Lọc trạng thái
        if (status === 'active' && item.da_thu_hoi) return false;
        if (status === 'returned' && !item.da_thu_hoi) return false;

        // Lọc từ khóa tìm kiếm
        if (q) {
            const msnv = (item.msnv || '').toLowerCase();
            const name = (item.hoten || '').toLowerCase();
            const deviceCode = (item.ma_thiet_bi || '').toLowerCase();
            const deviceName = (item.ten_thiet_bi || '').toLowerCase();
            const manager = (item.quanly || '').toLowerCase();
            
            return msnv.includes(q) || name.includes(q) || deviceCode.includes(q) || deviceName.includes(q) || manager.includes(q);
        }

        return true;
    });

    ccdcReportRender(filtered);
};

window.ccdcReportRefresh = function() {
    ccdcReportLoad();
    ccdcToast('🔄 Đang làm mới dữ liệu báo cáo...', 'success');
};

window.ccdcReportExportCSV = function() {
    if (ccdcReportData.length === 0) {
        ccdcToast('⚠️ Không có dữ liệu để xuất!', 'error');
        return;
    }

    const q = document.getElementById('ccdc-rep-search').value.trim().toLowerCase();
    const status = document.getElementById('ccdc-rep-filter-status').value;

    const filtered = ccdcReportData.filter(item => {
        if (status === 'active' && item.da_thu_hoi) return false;
        if (status === 'returned' && !item.da_thu_hoi) return false;
        if (q) {
            const msnv = (item.msnv || '').toLowerCase();
            const name = (item.hoten || '').toLowerCase();
            const deviceCode = (item.ma_thiet_bi || '').toLowerCase();
            const deviceName = (item.ten_thiet_bi || '').toLowerCase();
            const manager = (item.quanly || '').toLowerCase();
            return msnv.includes(q) || name.includes(q) || deviceCode.includes(q) || deviceName.includes(q) || manager.includes(q);
        }
        return true;
    });

    if (filtered.length === 0) {
        ccdcToast('⚠️ Không có dữ liệu phù hợp với bộ lọc để xuất!', 'error');
        return;
    }

    const headers = ['Thời Gian Giao', 'Mã Số Nhân Viên', 'Họ Và Tên', 'Ca Làm Việc', 'Quản Lý Trực Tiếp', 'Mã Thiết Bị', 'Tên Thiết Bị', 'Trạng Trạng Thu Hồi', 'Thời Gian Thu Hồi', 'Tình Trạng Thiết Bị', 'Ghi Chú', 'Người Thao Tác'];
    let csvContent = '\uFEFF'; 
    csvContent += headers.join(',') + '\n';

    filtered.forEach(item => {
        const row = [
            item.timestamp || '',
            item.msnv || '',
            item.hoten || '',
            item.ca || '',
            item.quanly || '',
            item.ma_thiet_bi || '',
            item.ten_thiet_bi || '',
            item.da_thu_hoi ? 'Đã thu hồi' : 'Đang mượn',
            item.thu_hoi_luc || '',
            item.tinh_trang || '',
            item.ghi_chu || '',
            item.nguoi_thao_tac || ''
        ];
        const escapedRow = row.map(val => {
            let str = String(val).replace(/"/g, '""');
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                str = `"${str}"`;
            }
            return str;
        });
        csvContent += escapedRow.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0');
    a.href = url;
    a.download = `BaoCao_ThietBi_CCDC_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    ccdcToast('✅ Đã tải xuống báo cáo CSV thiết bị!', 'success');
};

// Đăng ký auto-load khi nhấn vào tab Báo Cáo Thiết Bị
document.querySelectorAll('.nav-item[data-target="ccdc-report"]').forEach(nav => {
    nav.addEventListener('click', () => {
        ccdcReportLoad();
    });
});


