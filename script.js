/**
 * SynapseAURA — OBT Platform Copper Price Display
 *
 * READ-ONLY frontend. Prices are updated server-side by Luna via
 * screenshot → OCR pipeline (copper_price_updater.py).
 *
 * This script reads copperData.json (same-origin) and displays prices.
 * Hosted on GitHub Pages — zero Firebase dependency.
 */

const categories = [
    { name: "ทองแดงปอกสวย", deduction: 0.01, formula: "LME - 1%" },
    { name: "ทองแดงปอกดำ/ช๊อต", deduction: 0.03, formula: "LME - 3%" },
    { name: "ทองแดงท่อใหม่", deduction: 0.045, formula: "LME - 4.5%" },
    { name: "ทองแดงใหญ่/ทองเผาใหญ่", deduction: 0.07, formula: "LME - 7%" },
    { name: "ทองแดงเล็ก/ทองเผาเล็ก", deduction: 0.08, formula: "LME - 8%" },
    { name: "ทองแดงชุบ", deduction: 0.12, formula: "LME - 12%" },
    { name: "ทองแดงชุบเส้นถัก", deduction: 0.39, formula: "LME - 39%" },
    { name: "รังผึ้งทองแดงล้วน", deduction: 0.14, formula: "LME - 14%" },
    { name: "หม้อน้ำทองแดง", deduction: 0.50, formula: "LME - 50%" },
    { name: "กลึงทองแดง", deduction: 0.30, formula: "LME - 30%" }
];

// Configuration — populated from copperData.json (read-only)
let config = {
    lmePriceUSD: null,      // Base price in USD/tonne (backward compat)
    lmeRawUSD: null,         // Raw LME price in USD/tonne
    comexPriceUSD: null,     // COMEX in USD/tonne
    comexPriceLbs: null,     // COMEX in USD/lb
    fxRateTHB: null,
    targetLme7DaysUSD: null,
    priceHistory: [],         // 7-day LME history [{date, price}]
    lastUpdated: null,
    lastForecastDateKey: null,
    dataSource: null,
    lmeLastUpdated: null,
    comexLastUpdated: null
};

const DB_URL = "./copperData.json";

// DOM Elements
const priceGrid = document.getElementById('price-grid');
const template = document.getElementById('card-template');
const displayLME = document.getElementById('display-lme');
const displayFX = document.getElementById('display-fx');
const displayBaseTHB = document.getElementById('display-base-thb');
const lastUpdatedEl = document.getElementById('last-updated');

window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global Error:", message, error);
    const errObj = typeof error === 'object' && error !== null ? error.message || error.toString() : String(error || message);
    if (document.getElementById('last-updated')) {
        document.getElementById('last-updated').innerHTML = `<span style="color:red">Global Error: ${errObj}</span>`;
    }
    return true; 
};

// ── Initialization ─────────────────────────────────────────────────────

async function init() {
    try {
        drawEmptyGrid();
        
        // 1. Fetch price data (read-only)
        await fetchFromDatabase();
        
        // 2. Auto-refresh every 5 minutes (reads JSON, no writes)
        // Luna's updater writes every 1 hour; we poll more frequently to pick up changes
        setInterval(() => {
            fetchFromDatabase();
        }, 300000); // 5 minutes
        
    } catch (e) {
        console.error("Init Error:", e);
        if (document.getElementById('last-updated')) {
            document.getElementById('last-updated').innerHTML = `<span style="color:red">Init Error: ${e.message}</span>`;
        }
    }
}

// ── Data Read ──────────────────────────────────────────────────────────

async function fetchFromDatabase() {
    try {
        const dbRes = await fetch(DB_URL);
        if (!dbRes.ok) {
            throw new Error("Data fetch failed: " + dbRes.status);
        }
        
        const dbData = await dbRes.json();
        if (!dbData || !dbData.lmePriceUSD || !dbData.fxRateTHB) {
            lastUpdatedEl.innerHTML = `<span style="color: #ffaa00;">รอข้อมูลจาก Luna... (ยังไม่มีข้อมูลในระบบ)</span>`;
            return;
        }
        
        // Populate config from DB
        config.lmePriceUSD = dbData.lmePriceUSD;
        config.lmeRawUSD = dbData.lmeRawUSD || null;
        config.comexPriceUSD = dbData.comexPriceUSD || null;
        config.comexPriceLbs = dbData.comexPriceLbs || null;
        config.fxRateTHB = dbData.fxRateTHB;
        config.targetLme7DaysUSD = dbData.targetLme7DaysUSD;
        config.aiAnalysisText = dbData.aiAnalysisText || null;
        config.aiModel = dbData.aiModel || null;
        config.priceHistory = dbData.priceHistory || [];
        config.lastUpdated = dbData.lastUpdated;
        config.lastForecastDateKey = dbData.lastForecastDateKey;
        config.dataSource = dbData.dataSource || "unknown";
        config.lmeLastUpdated = dbData.lmeLastUpdated || null;
        config.comexLastUpdated = dbData.comexLastUpdated || null;
        
        updateUI();
        
    } catch (err) {
        console.error("DB fetch error:", err);
        lastUpdatedEl.innerHTML = `<span style="color: #ff5555;">เชื่อมต่อฐานข้อมูลไม่ได้ — ${err.message}</span>`;
    }
}

// ── UI Helpers ─────────────────────────────────────────────────────────

function formatCurrency(number) {
    if (isNaN(number) || number === null) return "0.00";
    return new Intl.NumberFormat('th-TH', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    }).format(number);
}

function formatIntegerCurrency(number) {
    if (isNaN(number) || number === null) return "0";
    return new Intl.NumberFormat('th-TH', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    }).format(Math.round(number));
}

function formatDate(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTimeOnly(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function drawEmptyGrid() {
    priceGrid.innerHTML = '';
    categories.forEach(cat => {
        const clone = template.content.cloneNode(true);
        clone.querySelector('.copper-type').textContent = cat.name;
        clone.querySelector('.amount').textContent = '...';
        priceGrid.appendChild(clone);
    });
}

// ── Main UI Update ─────────────────────────────────────────────────────

function updateUI() {
    // All prices are calculated from LME only
    const lmeUSD = config.lmeRawUSD || config.lmePriceUSD;
    if (!lmeUSD || !config.fxRateTHB) return;

    const lmePriceKgUSD = lmeUSD / 1000;
    const basePriceTHB = lmePriceKgUSD * config.fxRateTHB;
    
    // Base price = LME price (used for all scrap price calculations)
    displayLME.textContent = `$${formatCurrency(lmeUSD)}`;
    displayFX.textContent = `฿${formatCurrency(config.fxRateTHB)}`;
    displayBaseTHB.textContent = `฿${formatCurrency(basePriceTHB)}`;
    
    // LME Raw Price
    const displayLmeRaw = document.getElementById('display-lme-raw');
    if (displayLmeRaw) {
        if (config.lmeRawUSD) {
            displayLmeRaw.textContent = `$${formatCurrency(config.lmeRawUSD)}`;
        } else {
            displayLmeRaw.textContent = `$${formatCurrency(config.lmePriceUSD)}`;
        }
    }
    
    // COMEX Price in USD/lb
    const displayComexLbs = document.getElementById('display-comex-lbs');
    if (displayComexLbs) {
        if (config.comexPriceLbs) {
            displayComexLbs.textContent = `$${config.comexPriceLbs.toFixed(4)}`;
        } else {
            displayComexLbs.textContent = `N/A`;
        }
    }
    
    // Per-source timestamps
    const lmeTime = document.getElementById('lme-updated-time');
    if (lmeTime && config.lmeLastUpdated) {
        lmeTime.textContent = `อัพเดท: ${formatTimeOnly(config.lmeLastUpdated)}`;
    }
    const comexTime = document.getElementById('comex-updated-time');
    if (comexTime && config.comexLastUpdated) {
        comexTime.textContent = `อัพเดท: ${formatTimeOnly(config.comexLastUpdated)}`;
    }
    
    // Last updated + data source
    lastUpdatedEl.innerHTML = `อัพเดทล่าสุด: ${formatDate(config.lastUpdated)}`;
    
    const dataSourceEl = document.getElementById('data-source');
    if (dataSourceEl && config.dataSource) {
        const sourceLabel = config.dataSource === 'screenshot_ocr' 
            ? '📸 Screenshot OCR by Luna' 
            : '🤖 AI Fetch';
        dataSourceEl.textContent = sourceLabel;
    }
    
    // Price grid
    priceGrid.innerHTML = '';
    categories.forEach(cat => {
        const deductionAmount = basePriceTHB * cat.deduction;
        const finalPrice = basePriceTHB - deductionAmount;
        
        const clone = template.content.cloneNode(true);
        clone.querySelector('.copper-type').textContent = cat.name;
        clone.querySelector('.amount').textContent = formatIntegerCurrency(finalPrice);
        
        clone.querySelector('.price-card').classList.add('copper-item');
        
        priceGrid.appendChild(clone);
    });

    // 7-day forecast
    const targetEl = document.getElementById('target-beautiful-copper');
    if (targetEl && config.targetLme7DaysUSD) {
        const targetBaseTHB = (config.targetLme7DaysUSD / 1000) * config.fxRateTHB;
        const targetBeautifulCopper = targetBaseTHB * (1 - 0.01);
        targetEl.textContent = `฿${formatIntegerCurrency(targetBeautifulCopper)} / kg`;
    }

    const aiAnalysisEl = document.getElementById('ai-analysis-text');
    if (aiAnalysisEl && config.aiAnalysisText) {
        aiAnalysisEl.textContent = `“${config.aiAnalysisText}”`;
    }

    const disclaimerEl = document.getElementById('target-disclaimer');
    if (disclaimerEl && config.aiModel) {
        disclaimerEl.textContent = `*ประมวลผลวิเคราะห์โดย ${config.aiModel}`;
    }

    // Render 7-day price chart
    renderPriceChart();
}

// ── Price History Chart ────────────────────────────────────────────────

let priceChart = null;

function renderPriceChart() {
    const canvas = document.getElementById('price-chart');
    if (!canvas || !config.priceHistory || config.priceHistory.length === 0) return;

    // Reverse to oldest→newest order
    const history = [...config.priceHistory].reverse();

    // Parse date labels ("28. July 2026" → "28 Jul")
    const labels = history.map(h => {
        const parts = h.date.replace('.', '').split(' ');
        const day = parts[0] || '';
        const month = (parts[1] || '').substring(0, 3);
        return `${day} ${month}`;
    });
    const prices = history.map(h => h.price);

    // Find the midpoint index (current price at center)
    const midIdx = Math.floor(prices.length / 2);

    // Point styles: larger copper dot for the center (current price)
    const pointRadii = prices.map((_, i) => i === prices.length - 1 ? 8 : (i === midIdx ? 6 : 3));
    const pointBgColors = prices.map((_, i) =>
        i === prices.length - 1 ? '#ff6b35' : (i === midIdx ? '#b87333' : 'rgba(184, 115, 51, 0.6)')
    );
    const pointBorderColors = prices.map((_, i) =>
        i === prices.length - 1 ? '#fff' : (i === midIdx ? '#fff' : 'transparent')
    );
    const pointBorderWidths = prices.map((_, i) =>
        i === prices.length - 1 ? 3 : (i === midIdx ? 2 : 0)
    );

    // Destroy previous chart instance if exists
    if (priceChart) {
        priceChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Gradient fill under the line
    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, 'rgba(184, 115, 51, 0.4)');
    gradient.addColorStop(0.5, 'rgba(184, 115, 51, 0.15)');
    gradient.addColorStop(1, 'rgba(184, 115, 51, 0)');

    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'LME Copper (USD/Tonne)',
                data: prices,
                borderColor: '#b87333',
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointRadius: pointRadii,
                pointBackgroundColor: pointBgColors,
                pointBorderColor: pointBorderColors,
                pointBorderWidth: pointBorderWidths,
                pointHoverRadius: 10,
                pointHoverBorderWidth: 3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(20, 20, 30, 0.95)',
                    titleFont: { family: 'Kanit', size: 14 },
                    bodyFont: { family: 'Inter', size: 13 },
                    padding: 12,
                    cornerRadius: 8,
                    borderColor: 'rgba(184, 115, 51, 0.5)',
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            const idx = ctx.dataIndex;
                            const isLatest = idx === prices.length - 1;
                            const prefix = isLatest ? '★ ราคาล่าสุด: ' : '';
                            return `${prefix}$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)',
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Inter', size: 12 },
                    },
                    border: { color: 'rgba(255, 255, 255, 0.1)' },
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)',
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Inter', size: 12 },
                        callback: (val) => '$' + val.toLocaleString(),
                    },
                    border: { color: 'rgba(255, 255, 255, 0.1)' },
                }
            }
        }
    });
}

init();
